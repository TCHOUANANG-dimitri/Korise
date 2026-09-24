"""Read-only aggregations behind the reports screen and the branded PDFs.

Everything is derived from the event tables on the fly (same principle as the rest of the
project: no duplicated data). Dates are UTC calendar days, consistent with closing_service."""

import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import func
from sqlmodel import Session, select

from app.models.business import Business
from app.models.catalog import Product
from app.models.customer import Customer
from app.models.events import (
    DailyClosing,
    MoneyMovement,
    MoneyMovementType,
    Sale,
    StockMovement,
)
from app.models.shift import Shift
from app.models.user import User
from app.services.credit_service import _customer_balance


def _bounds(date_from: date, date_to: date) -> tuple[datetime, datetime]:
    start = datetime.combine(date_from, datetime.min.time())
    end = datetime.combine(date_to, datetime.min.time()) + timedelta(days=1)
    return start, end


def sales_rows(
    session: Session,
    business_id: uuid.UUID,
    date_from: date,
    date_to: date,
    user_id: uuid.UUID | None = None,
    product_id: uuid.UUID | None = None,
    payment_method: str | None = None,
):
    start, end = _bounds(date_from, date_to)
    q = (
        select(Sale, Product.name, User.full_name)
        .join(Product, Product.id == Sale.product_id)
        .join(User, User.id == Sale.user_id)
        .where(Sale.business_id == business_id)
        .where(Sale.created_at >= start)
        .where(Sale.created_at < end)
    )
    if user_id:
        q = q.where(Sale.user_id == user_id)
    if product_id:
        q = q.where(Sale.product_id == product_id)
    if payment_method:
        q = q.where(Sale.payment_method == payment_method)
    return session.exec(q.order_by(Sale.created_at.desc())).all()


def summary(
    session: Session,
    business_id: uuid.UUID,
    date_from: date,
    date_to: date,
    *,
    user_id: uuid.UUID | None = None,
    product_id: uuid.UUID | None = None,
    payment_method: str | None = None,
    with_costs: bool = False,
) -> dict:
    """Advanced report figures for a period (cahier web « rapports avancés »)."""
    start, end = _bounds(date_from, date_to)
    rows = sales_rows(session, business_id, date_from, date_to, user_id, product_id, payment_method)

    by_payment: dict[str, dict] = {}
    by_product: dict[str, dict] = {}
    by_employee: dict[str, dict] = {}
    sales_total = 0
    cost_total = 0
    products_cost = {
        p.id: p.purchase_price
        for p in session.exec(select(Product).where(Product.business_id == business_id)).all()
    }
    for sale, product_name, user_name in rows:
        sales_total += sale.total_amount
        cost_total += products_cost.get(sale.product_id, 0) * sale.quantity
        for bucket, key in ((by_payment, sale.payment_method), (by_product, product_name), (by_employee, user_name)):
            entry = bucket.setdefault(key, {"count": 0, "quantity": 0, "total": 0})
            entry["count"] += 1
            entry["quantity"] += sale.quantity
            entry["total"] += sale.total_amount

    mm = (
        select(MoneyMovement.type, MoneyMovement.category, func.sum(MoneyMovement.amount))
        .where(MoneyMovement.business_id == business_id)
        .where(MoneyMovement.created_at >= start)
        .where(MoneyMovement.created_at < end)
        .group_by(MoneyMovement.type, MoneyMovement.category)
    )
    if user_id:
        mm = mm.where(MoneyMovement.user_id == user_id)
    totals = {t.value: 0 for t in MoneyMovementType}
    expense_by_category: dict[str, int] = {}
    for mtype, category, amount in session.exec(mm).all():
        totals[mtype.value] += int(amount)
        if mtype == MoneyMovementType.expense:
            key = category or "Sans catégorie"
            expense_by_category[key] = expense_by_category.get(key, 0) + abs(int(amount))

    credit_granted = sum(s.total_amount for s, _, _ in rows if s.payment_method == "credit")
    customers = session.exec(select(Customer).where(Customer.business_id == business_id)).all()
    credit_outstanding = sum(max(0, _customer_balance(session, business_id, c.id)) for c in customers)

    result = {
        "date_from": date_from,
        "date_to": date_to,
        "sales_count": len(rows),
        "sales_total": sales_total,
        "by_payment": [{"key": k, **v} for k, v in sorted(by_payment.items(), key=lambda kv: -kv[1]["total"])],
        "by_product": [{"key": k, **v} for k, v in sorted(by_product.items(), key=lambda kv: -kv[1]["total"])],
        "by_employee": [{"key": k, **v} for k, v in sorted(by_employee.items(), key=lambda kv: -kv[1]["total"])],
        "expenses_total": abs(totals["expense"]),
        "expenses_by_category": [
            {"key": k, "total": v} for k, v in sorted(expense_by_category.items(), key=lambda kv: -kv[1])
        ],
        "income_total": totals["income"],
        "withdrawals_total": abs(totals["withdrawal"]),
        "credit_repayments_total": totals["credit_repayment"],
        "credit_granted": credit_granted,
        "credit_outstanding": credit_outstanding,
        "estimated_profit": (sales_total - cost_total - abs(totals["expense"])) if with_costs else None,
    }
    return result


def stock_report(session: Session, business_id: uuid.UUID, with_costs: bool) -> list[dict]:
    since = datetime.utcnow() - timedelta(days=30)
    moves = dict(
        session.exec(
            select(StockMovement.product_id, func.count(StockMovement.id))
            .where(StockMovement.business_id == business_id)
            .where(StockMovement.created_at >= since)
            .group_by(StockMovement.product_id)
        ).all()
    )
    out = []
    for p in session.exec(
        select(Product).where(Product.business_id == business_id).where(Product.is_active == True).order_by(Product.name)  # noqa: E712
    ).all():
        out.append(
            {
                "name": p.name,
                "quantity": p.quantity,
                "minimum_stock": p.minimum_stock,
                "alert": p.is_stockable and p.quantity <= p.minimum_stock,
                "selling_price": p.selling_price,
                "value": p.quantity * p.purchase_price if with_costs else None,
                "movements_30d": int(moves.get(p.id, 0)),
            }
        )
    return out


def day_report(session: Session, business_id: uuid.UUID, day: date, with_costs: bool) -> dict:
    """Bilan automatique de journée (cahier fonctionnel §6)."""
    base = summary(session, business_id, day, day, with_costs=with_costs)
    closing = session.exec(
        select(DailyClosing)
        .where(DailyClosing.business_id == business_id)
        .where(DailyClosing.closing_date == day)
        .order_by(DailyClosing.created_at.desc())
    ).first()
    start, end = _bounds(day, day)
    shifts = session.exec(
        select(Shift, User.full_name)
        .join(User, User.id == Shift.user_id)
        .where(Shift.business_id == business_id)
        .where(Shift.opened_at >= start)
        .where(Shift.opened_at < end)
        .order_by(Shift.opened_at)
    ).all()
    base["closing"] = closing
    base["shifts"] = shifts
    return base


def employee_report(
    session: Session, business_id: uuid.UUID, user_id: uuid.UUID, date_from: date, date_to: date
) -> dict:
    user = session.get(User, user_id)
    base = summary(session, business_id, date_from, date_to, user_id=user_id)
    start, end = _bounds(date_from, date_to)
    shifts = session.exec(
        select(Shift)
        .where(Shift.business_id == business_id)
        .where(Shift.user_id == user_id)
        .where(Shift.opened_at >= start)
        .where(Shift.opened_at < end)
        .order_by(Shift.opened_at)
    ).all()
    closings = session.exec(
        select(DailyClosing)
        .where(DailyClosing.business_id == business_id)
        .where(DailyClosing.user_id == user_id)
        .where(DailyClosing.closing_date >= date_from)
        .where(DailyClosing.closing_date <= date_to)
        .order_by(DailyClosing.closing_date)
    ).all()
    base["user"] = user
    base["shifts"] = shifts
    base["closings"] = closings
    return base


def business_of(session: Session, business_id: uuid.UUID) -> Business:
    return session.get(Business, business_id)

