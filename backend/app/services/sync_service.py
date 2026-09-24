import uuid
from datetime import datetime

from fastapi import HTTPException
from sqlmodel import Session, select
from sqlalchemy import String, and_, or_

from app.models.catalog import Product
from app.models.customer import Customer
from app.models.events import (
    AuditLog,
    DailyClosing,
    MoneyMovement,
    MoneyMovementChannel,
    MoneyMovementType,
    Sale,
    StockMovement,
    StockMovementType,
)
from app.models.shift import Shift
from app.services.closing_service import compute_expected_amounts
from app.services.credit_service import create_customer, record_repayment, resolve_customer
from app.schemas.sync import (
    CreditRepaymentIn,
    CustomerIn,
    DailyClosingIn,
    MoneyMovementIn,
    PullResponse,
    PushRequest,
    PushResponse,
    PushResult,
    SaleIn,
    ShiftIn,
    StockMovementIn,
)

PULL_PAGE_SIZE = 500


def _record_sale(session: Session, business_id: uuid.UUID, user_id: uuid.UUID, item: SaleIn) -> PushResult:
    existing = session.exec(select(Sale).where(Sale.client_uuid == item.client_uuid)).first()
    if existing:
        return PushResult(client_uuid=item.client_uuid, status="duplicate")

    is_credit = item.payment_method == "credit"
    if is_credit and item.customer_id is None:
        raise ValueError("Une vente à crédit nécessite un client (customer_id)")
    customer = None
    if item.customer_id is not None:
        try:
            customer = resolve_customer(session, business_id, item.customer_id)
        except ValueError:
            raise ValueError("Client inconnu pour cette entreprise") from None

    with session.begin_nested():
        total_amount = item.quantity * item.unit_price
        sale = Sale(
            client_uuid=item.client_uuid,
            business_id=business_id,
            user_id=user_id,
            product_id=item.product_id,
            customer_id=customer.id if customer else None,
            quantity=item.quantity,
            unit_price=item.unit_price,
            total_amount=total_amount,
            payment_method=item.payment_method,
        )
        session.add(sale)
        session.flush()

        product = session.get(Product, item.product_id)
        stockable = product is None or product.is_stockable
        if product is not None and stockable:
            # Deliberately never blocked by insufficient stock — see SYNC_DESIGN.md #6.
            product.quantity -= item.quantity
            session.add(product)

        # Un service (non stockable) ne touche jamais au stock.
        if stockable:
            session.add(
                StockMovement(
                    client_uuid=uuid.uuid4(),
                    business_id=business_id,
                    user_id=user_id,
                    product_id=item.product_id,
                    type=StockMovementType.sale,
                    quantity_delta=-item.quantity,
                    sale_id=sale.id,
                )
            )
        # Une vente à crédit ne produit AUCUN mouvement de caisse : l'argent
        # arrive plus tard, via un remboursement (credit_repayment).
        if not is_credit:
            session.add(
                MoneyMovement(
                    client_uuid=uuid.uuid4(),
                    business_id=business_id,
                    user_id=user_id,
                    type=MoneyMovementType.sale,
                    channel=MoneyMovementChannel(item.payment_method),
                    amount=total_amount,
                    sale_id=sale.id,
                )
            )
        session.add(
            AuditLog(
                business_id=business_id,
                user_id=user_id,
                action="sale.created",
                entity_type="sale",
                entity_id=sale.id,
            )
        )

    return PushResult(client_uuid=item.client_uuid, status="accepted")


def _record_money_movement(
    session: Session, business_id: uuid.UUID, user_id: uuid.UUID, item: MoneyMovementIn
) -> PushResult:
    existing = session.exec(
        select(MoneyMovement).where(MoneyMovement.client_uuid == item.client_uuid)
    ).first()
    if existing:
        return PushResult(client_uuid=item.client_uuid, status="duplicate")

    with session.begin_nested():
        movement = MoneyMovement(
            client_uuid=item.client_uuid,
            business_id=business_id,
            user_id=user_id,
            type=MoneyMovementType(item.type.value),
            channel=item.channel,
            amount=item.amount,
            reason=item.reason,
            category=item.category,
        )
        session.add(movement)
        session.flush()
        session.add(
            AuditLog(
                business_id=business_id,
                user_id=user_id,
                action="money_movement.created",
                entity_type="money_movement",
                entity_id=movement.id,
            )
        )

    return PushResult(client_uuid=item.client_uuid, status="accepted")


def _record_stock_movement(
    session: Session, business_id: uuid.UUID, user_id: uuid.UUID, item: StockMovementIn
) -> PushResult:
    existing = session.exec(
        select(StockMovement).where(StockMovement.client_uuid == item.client_uuid)
    ).first()
    if existing:
        return PushResult(client_uuid=item.client_uuid, status="duplicate")

    with session.begin_nested():
        movement = StockMovement(
            client_uuid=item.client_uuid,
            business_id=business_id,
            user_id=user_id,
            product_id=item.product_id,
            type=StockMovementType(item.type.value),
            quantity_delta=item.quantity_delta,
            reason=item.reason,
        )
        session.add(movement)
        session.flush()

        product = session.get(Product, item.product_id)
        if product is not None:
            product.quantity += item.quantity_delta
            session.add(product)

        session.add(
            AuditLog(
                business_id=business_id,
                user_id=user_id,
                action="stock_movement.created",
                entity_type="stock_movement",
                entity_id=movement.id,
            )
        )

    return PushResult(client_uuid=item.client_uuid, status="accepted")


def _record_daily_closing(
    session: Session, business_id: uuid.UUID, user_id: uuid.UUID, item: DailyClosingIn
) -> PushResult:
    existing = session.exec(
        select(DailyClosing).where(DailyClosing.client_uuid == item.client_uuid)
    ).first()
    if existing:
        return PushResult(client_uuid=item.client_uuid, status="duplicate")

    with session.begin_nested():
        expected_cash, expected_momo, expected_orange = compute_expected_amounts(
            session, business_id, item.closing_date
        )
        closing = DailyClosing(
            client_uuid=item.client_uuid,
            business_id=business_id,
            user_id=user_id,
            closing_date=item.closing_date,
            expected_cash=expected_cash,
            actual_cash=item.actual_cash,
            difference=item.actual_cash - expected_cash,
            expected_momo=expected_momo,
            actual_momo=item.actual_momo,
            difference_momo=item.actual_momo - expected_momo,
            expected_orange=expected_orange,
            actual_orange=item.actual_orange,
            difference_orange=item.actual_orange - expected_orange,
            note=item.note,
        )
        session.add(closing)
        session.flush()
        session.add(
            AuditLog(
                business_id=business_id,
                user_id=user_id,
                action="daily_closing.created",
                entity_type="daily_closing",
                entity_id=closing.id,
            )
        )

    return PushResult(client_uuid=item.client_uuid, status="accepted")


def _record_customer(session: Session, business_id: uuid.UUID, user_id: uuid.UUID, item: CustomerIn) -> PushResult:
    try:
        create_customer(session, business_id, user_id, item)
    except HTTPException as exc:
        raise ValueError(exc.detail) from exc
    return PushResult(client_uuid=item.client_uuid, status="accepted")


def _record_credit_repayment(
    session: Session, business_id: uuid.UUID, user_id: uuid.UUID, item: CreditRepaymentIn
) -> PushResult:
    try:
        return record_repayment(session, business_id, user_id, item)
    except HTTPException as exc:
        raise ValueError(exc.detail) from exc


def _naive_utc(dt: datetime) -> datetime:
    """Columns are TIMESTAMP WITHOUT TIME ZONE holding UTC: normalise client datetimes."""
    if dt.tzinfo is not None:
        from datetime import timezone

        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _record_shift(session: Session, business_id: uuid.UUID, user_id: uuid.UUID, item: ShiftIn) -> PushResult:
    """Open (first push) or close (push carrying closed_at) one shift — idempotent on client_uuid."""
    from sqlalchemy import func

    existing = session.exec(select(Shift).where(Shift.client_uuid == item.client_uuid)).first()
    closing_now = item.closed_at is not None and item.counted_cash is not None

    if existing is not None and (existing.closed_at is not None or not closing_now):
        return PushResult(client_uuid=item.client_uuid, status="duplicate")
    if existing is not None and existing.business_id != business_id:
        raise ValueError("Shift inconnu pour cette entreprise")

    with session.begin_nested():
        shift = existing
        opened_new = shift is None
        if shift is None:
            shift = Shift(
                client_uuid=item.client_uuid,
                business_id=business_id,
                user_id=user_id,
                opened_at=_naive_utc(item.opened_at),
                opening_cash=item.opening_cash,
                note=item.note,
            )
            session.add(shift)
            session.flush()
            session.add(
                AuditLog(
                    business_id=business_id,
                    user_id=user_id,
                    action="shift.opened",
                    entity_type="shift",
                    entity_id=shift.id,
                )
            )
        if closing_now:
            closed_at = _naive_utc(item.closed_at)
            channel = MoneyMovement.channel.cast(String)
            cash_flow = session.exec(
                select(func.coalesce(func.sum(MoneyMovement.amount), 0))
                .where(MoneyMovement.business_id == business_id)
                .where(MoneyMovement.user_id == shift.user_id)
                .where(MoneyMovement.created_at >= shift.opened_at)
                .where(MoneyMovement.created_at <= closed_at)
                .where(func.coalesce(channel, "cash") == "cash")
            ).one()
            shift.closed_at = closed_at
            shift.counted_cash = item.counted_cash
            shift.expected_cash = shift.opening_cash + int(cash_flow)
            shift.difference = item.counted_cash - shift.expected_cash
            if item.note:
                shift.note = item.note
            session.add(shift)
            session.flush()
            session.add(
                AuditLog(
                    business_id=business_id,
                    user_id=user_id,
                    action="shift.closed",
                    entity_type="shift",
                    entity_id=shift.id,
                    details=f"écart {shift.difference} FCFA",
                )
            )
        elif not opened_new:
            return PushResult(client_uuid=item.client_uuid, status="duplicate")

    return PushResult(client_uuid=item.client_uuid, status="accepted")


def push_batch(session: Session, business_id: uuid.UUID, user_id: uuid.UUID, request: PushRequest) -> PushResponse:
    response = PushResponse()

    for item in request.sales:
        try:
            response.sales.append(_record_sale(session, business_id, user_id, item))
        except Exception as exc:  # noqa: BLE001 — one bad item must not sink the whole batch
            response.sales.append(
                PushResult(client_uuid=item.client_uuid, status="rejected", detail=str(exc))
            )

    for item in request.money_movements:
        try:
            response.money_movements.append(_record_money_movement(session, business_id, user_id, item))
        except Exception as exc:  # noqa: BLE001
            response.money_movements.append(
                PushResult(client_uuid=item.client_uuid, status="rejected", detail=str(exc))
            )

    for item in request.stock_movements:
        try:
            response.stock_movements.append(_record_stock_movement(session, business_id, user_id, item))
        except Exception as exc:  # noqa: BLE001
            response.stock_movements.append(
                PushResult(client_uuid=item.client_uuid, status="rejected", detail=str(exc))
            )

    for item in request.daily_closings:
        try:
            response.daily_closings.append(_record_daily_closing(session, business_id, user_id, item))
        except Exception as exc:  # noqa: BLE001
            response.daily_closings.append(
                PushResult(client_uuid=item.client_uuid, status="rejected", detail=str(exc))
            )

    for item in request.customers:
        try:
            response.customers.append(_record_customer(session, business_id, user_id, item))
        except Exception as exc:  # noqa: BLE001
            response.customers.append(
                PushResult(client_uuid=item.client_uuid, status="rejected", detail=str(exc))
            )

    for item in request.credit_repayments:
        try:
            response.credit_repayments.append(_record_credit_repayment(session, business_id, user_id, item))
        except Exception as exc:  # noqa: BLE001
            response.credit_repayments.append(
                PushResult(client_uuid=item.client_uuid, status="rejected", detail=str(exc))
            )

    for item in request.shifts:
        try:
            response.shifts.append(_record_shift(session, business_id, user_id, item))
        except Exception as exc:  # noqa: BLE001
            response.shifts.append(
                PushResult(client_uuid=item.client_uuid, status="rejected", detail=str(exc))
            )

    session.commit()
    return response


def encode_cursor(dt: datetime, id_: uuid.UUID) -> str:
    return f"{dt.isoformat()}|{id_}"


def decode_cursor(raw: str | None) -> tuple[datetime, uuid.UUID] | None:
    if not raw:
        return None
    dt_str, id_str = raw.rsplit("|", 1)
    return datetime.fromisoformat(dt_str), uuid.UUID(id_str)


def _cursor_filter(model, since: tuple[datetime, uuid.UUID] | None):
    if since is None:
        return True
    since_dt, since_id = since
    return or_(
        model.created_at > since_dt,
        and_(model.created_at == since_dt, model.id > since_id),
    )


def _paginate(session: Session, model, business_id: uuid.UUID, since_raw: str | None):
    since = decode_cursor(since_raw)
    rows = session.exec(
        select(model)
        .where(model.business_id == business_id)
        .where(_cursor_filter(model, since))
        .order_by(model.created_at, model.id)
        .limit(PULL_PAGE_SIZE)
    ).all()
    next_cursor = encode_cursor(rows[-1].created_at, rows[-1].id) if rows else since_raw
    return rows, next_cursor


def pull_batch(
    session: Session,
    business_id: uuid.UUID,
    since_sales: str | None,
    since_money_movements: str | None,
    since_stock_movements: str | None,
    since_daily_closings: str | None,
    since_customers: str | None,
) -> PullResponse:
    sales, cursor_sales = _paginate(session, Sale, business_id, since_sales)
    money_movements, cursor_money = _paginate(session, MoneyMovement, business_id, since_money_movements)
    stock_movements, cursor_stock = _paginate(session, StockMovement, business_id, since_stock_movements)
    daily_closings, cursor_closings = _paginate(session, DailyClosing, business_id, since_daily_closings)
    customers, cursor_customers = _paginate(session, Customer, business_id, since_customers)

    return PullResponse(
        sales=[s.model_dump(mode="json") for s in sales],
        money_movements=[m.model_dump(mode="json") for m in money_movements],
        stock_movements=[m.model_dump(mode="json") for m in stock_movements],
        daily_closings=[c.model_dump(mode="json") for c in daily_closings],
        customers=[c.model_dump(mode="json") for c in customers],
        cursors={
            "sales": cursor_sales,
            "money_movements": cursor_money,
            "stock_movements": cursor_stock,
            "daily_closings": cursor_closings,
            "customers": cursor_customers,
        },
    )
