import uuid
from datetime import date, datetime, timedelta

from sqlmodel import Session, select
from sqlalchemy import func

from app.models.anomaly import AnomalyResolution
from app.models.catalog import Product
from app.models.events import DailyClosing, MoneyMovement, Sale, StockMovement, StockMovementType
from app.models.shift import Shift
from app.models.user import User
from app.schemas.anomaly import AnomalyOut, RelatedOperationOut

# Règles MVP (approximation assumée, voir opencode.md chantier B.2) :
# - un ajustement de stock est "important" à partir d'une perte de X unités sans motif ;
# - un écart de prix est "fort" à partir d'une déviation relative de 50 % par rapport au prix
#   catalogue actuel (le prix au moment de la vente n'étant pas historique, le prix actuel
#   est l'approximation documentée).
# - fenêtre de prévisualisation par défaut : les 14 derniers jours.
STOCK_LOSS_UNITS_THRESHOLD = 10
PRICE_DEVIATION_RATIO = 0.5
DEFAULT_WINDOW_DAYS = 14

ANOMALY_RESOLVED = "resolved"
ANOMALY_OPEN = "open"


def _fetch_names(session: Session, business_id: uuid.UUID) -> tuple[dict[uuid.UUID, str], dict[uuid.UUID, str]]:
    users = session.exec(
        select(User.id, User.full_name).where(User.business_id == business_id)
    ).all()
    products = session.exec(
        select(Product.id, Product.name).where(Product.business_id == business_id)
    ).all()
    return dict(users), dict(products)


def _resolutions_map(
    session: Session, business_id: uuid.UUID
) -> dict[tuple[str, uuid.UUID], AnomalyResolution]:
    rows = session.exec(
        select(AnomalyResolution).where(AnomalyResolution.business_id == business_id)
    ).all()
    return {(r.anomaly_type, r.source_id): r for r in rows}


def _closing_gap_anomalies(
    session: Session,
    business_id: uuid.UUID,
    since: date,
    user_names: dict[uuid.UUID, str],
    resolved: dict[tuple[str, uuid.UUID], AnomalyResolution],
) -> list[AnomalyOut]:
    closings = session.exec(
        select(DailyClosing)
        .where(DailyClosing.business_id == business_id)
        .where(DailyClosing.closing_date >= since)
        .order_by(DailyClosing.closing_date.desc())
    ).all()
    out: list[AnomalyOut] = []
    for c in closings:
        gaps = [
            c.difference,
            c.difference_momo if c.difference_momo is not None else 0,
            c.difference_orange if c.difference_orange is not None else 0,
        ]
        total_gap = sum(gaps)
        # Un excédent d'un canal et un manquant d'un autre se compensent dans la somme mais
        # restent deux écarts réels à expliquer : on teste chaque canal, pas le total.
        if not any(gaps):
            continue
        r = resolved.get(("closing_gap", c.id))
        if r is None:
            extra = f"pour le {c.closing_date.isoformat()}"
            resolution = None
        else:
            extra = r.source_extra or ""
            resolution = r
        out.append(
            AnomalyOut(
                kind="closing_gap",
                label=f"Écart de clôture {'— ' + extra if extra else ''}".rstrip(),
                probable_cause=(
                    "Dépense ou retrait non saisi, rendu de monnaie erroné ou manquant de caisse"
                    if total_gap < 0
                    else "Vente ou entrée non saisie, ou erreur de comptage"
                ),
                detail="La caisse comptée ne correspond pas à la caisse attendue "
                f"({c.expected_cash} FCFA attendus / {c.actual_cash} comptés en espèces).",
                amount=total_gap,
                date=c.closing_date,
                user_name=user_names.get(c.user_id),
                source_type="daily_closing",
                source_id=c.id,
                status=ANOMALY_RESOLVED if resolution else ANOMALY_OPEN,
                resolved_at=resolution.resolved_at if resolution else None,
                resolution_note=resolution.note if resolution else None,
            )
        )
    return out


def _stock_adjustment_anomalies(
    session: Session,
    business_id: uuid.UUID,
    since: datetime,
    product_names: dict[uuid.UUID, str],
    user_names: dict[uuid.UUID, str],
    resolved: dict[tuple[str, uuid.UUID], AnomalyResolution],
) -> list[AnomalyOut]:
    movements = session.exec(
        select(StockMovement)
        .where(StockMovement.business_id == business_id)
        .where(StockMovement.type == StockMovementType.adjustment)
        .where(StockMovement.reason.is_(None))
        .where(StockMovement.quantity_delta <= -STOCK_LOSS_UNITS_THRESHOLD)
        .where(StockMovement.created_at >= since)
        .order_by(StockMovement.created_at.desc())
    ).all()
    out: list[AnomalyOut] = []
    for m in movements:
        r = resolved.get(("stock_adjustment", m.id))
        product_name = product_names.get(m.product_id)
        out.append(
            AnomalyOut(
                kind="stock_adjustment",
                label="Ajustement de stock sans motif",
                probable_cause="Casse, perte ou sortie non justifiée",
                detail=f"{abs(m.quantity_delta)} unités retirées de «{product_name or 'produit'}» "
                "sans motif renseigné.",
                amount=m.quantity_delta,
                date=m.created_at,
                product_name=product_name,
                user_name=user_names.get(m.user_id),
                source_type="stock_movement",
                source_id=m.id,
                status=ANOMALY_RESOLVED if r else ANOMALY_OPEN,
                resolved_at=r.resolved_at if r else None,
                resolution_note=r.note if r else None,
            )
        )
    return out


def _price_deviation_anomalies(
    session: Session,
    business_id: uuid.UUID,
    since: datetime,
    product_names: dict[uuid.UUID, str],
    user_names: dict[uuid.UUID, str],
    resolved: dict[tuple[str, uuid.UUID], AnomalyResolution],
) -> list[AnomalyOut]:
    sales = session.exec(
        select(Sale)
        .where(Sale.business_id == business_id)
        .where(Sale.created_at >= since)
        .order_by(Sale.created_at.desc())
    ).all()
    # Prix catalogue actuel (approximation MVP — le prix au moment de la vente n'est pas
    # historique, voir opencode.md chantier B.2).
    products = session.exec(
        select(Product.id, Product.selling_price).where(Product.business_id == business_id)
    ).all()
    current_prices = dict(products)

    out: list[AnomalyOut] = []
    for s in sales:
        catalog_price = current_prices.get(s.product_id)
        if not catalog_price:
            continue
        deviation = s.unit_price - catalog_price
        if abs(deviation) / catalog_price < PRICE_DEVIATION_RATIO:
            continue
        r = resolved.get(("price_deviation", s.id))
        product_name = product_names.get(s.product_id)
        sign = "-" if deviation < 0 else "+"
        out.append(
            AnomalyOut(
                kind="price_deviation",
                label=f"Vente à un prix éloigné du catalogue ({sign}{abs(deviation)} FCFA)",
                detail=f"«{product_name or 'produit'}» vendu à {s.unit_price} FCFA "
                f"alors que le prix catalogue est de {catalog_price} FCFA.",
                probable_cause="Remise non prévue ou erreur de prix à l'encaissement",
                amount=deviation,
                date=s.created_at,
                product_name=product_name,
                user_name=user_names.get(s.user_id),
                source_type="sale",
                source_id=s.id,
                status=ANOMALY_RESOLVED if r else ANOMALY_OPEN,
                resolved_at=r.resolved_at if r else None,
                resolution_note=r.note if r else None,
            )
        )
    return out


def _shift_gap_anomalies(
    session: Session,
    business_id: uuid.UUID,
    since: datetime,
    user_names: dict[uuid.UUID, str],
    resolved: dict[tuple[str, uuid.UUID], AnomalyResolution],
) -> list[AnomalyOut]:
    shifts = session.exec(
        select(Shift)
        .where(Shift.business_id == business_id)
        .where(Shift.closed_at.is_not(None))
        .where(Shift.difference.is_not(None))
        .where(Shift.difference != 0)
        .where(Shift.closed_at >= since)
        .order_by(Shift.closed_at.desc())
    ).all()
    out: list[AnomalyOut] = []
    for sh in shifts:
        r = resolved.get(("shift_gap", sh.id))
        who = user_names.get(sh.user_id) or "un employé"
        out.append(
            AnomalyOut(
                kind="shift_gap",
                label=f"Écart de shift — {who}",
                detail=f"Fond de caisse {sh.opening_cash} FCFA, attendu en fin de shift "
                f"{sh.expected_cash} FCFA, compté {sh.counted_cash} FCFA.",
                probable_cause=(
                    "Manquant sur la période du shift : rendu de monnaie, sortie non saisie"
                    if (sh.difference or 0) < 0
                    else "Excédent : vente ou entrée non saisie pendant le shift"
                ),
                amount=sh.difference,
                date=sh.closed_at,
                user_name=user_names.get(sh.user_id),
                source_type="shift",
                source_id=sh.id,
                status=ANOMALY_RESOLVED if r else ANOMALY_OPEN,
                resolved_at=r.resolved_at if r else None,
                resolution_note=r.note if r else None,
            )
        )
    return out


def list_anomalies(
    session: Session,
    business_id: uuid.UUID,
    days: int = DEFAULT_WINDOW_DAYS,
    only_open: bool = False,
) -> list[AnomalyOut]:
    """Derives the anomaly list from live business data (+ manual resolutions)."""
    user_names, product_names = _fetch_names(session, business_id)
    resolved = _resolutions_map(session, business_id)

    since_dt = datetime.utcnow() - timedelta(days=max(days, 1))
    since_date = since_dt.date()

    anomalies: list[AnomalyOut] = []
    anomalies.extend(
        _closing_gap_anomalies(session, business_id, since_date, user_names, resolved)
    )
    anomalies.extend(
        _stock_adjustment_anomalies(session, business_id, since_dt, product_names, user_names, resolved)
    )
    anomalies.extend(
        _price_deviation_anomalies(session, business_id, since_dt, product_names, user_names, resolved)
    )

    anomalies.extend(_shift_gap_anomalies(session, business_id, since_dt, user_names, resolved))

    if only_open:
        anomalies = [a for a in anomalies if a.status == ANOMALY_OPEN]

    anomalies.sort(key=lambda a: a.date, reverse=True)
    return anomalies


def resolve_anomaly(
    session: Session,
    business_id: uuid.UUID,
    user_id: uuid.UUID,
    anomaly_type: str,
    source_id: uuid.UUID,
    source_extra: str | None,
    note: str | None,
) -> AnomalyResolution:
    """Marks an anomaly as resolved (idempotent). Returns the (possibly existing) row."""
    existing = session.exec(
        select(AnomalyResolution).where(
            AnomalyResolution.business_id == business_id,
            AnomalyResolution.anomaly_type == anomaly_type,
            AnomalyResolution.source_id == source_id,
        )
    ).first()
    if existing is not None:
        return existing

    row = AnomalyResolution(
        business_id=business_id,
        anomaly_type=anomaly_type,
        source_id=source_id,
        source_extra=source_extra,
        resolved_by=user_id,
        note=note,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


_MONEY_LABELS = {
    "sale": "Vente encaissée",
    "income": "Entrée d'argent",
    "expense": "Dépense",
    "withdrawal": "Retrait",
    "credit_repayment": "Remboursement de crédit",
}
_STOCK_LABELS = {"sale": "Vente", "restock": "Entrée de stock", "adjustment": "Ajustement"}


def related_operations(
    session: Session, business_id: uuid.UUID, anomaly_type: str, source_id: uuid.UUID
) -> list[RelatedOperationOut]:
    """Operations behind an anomaly, most recent first — lets the owner go from a global gap
    down to the operations that could explain it (cahier « historique d'un écart »)."""
    user_names, product_names = _fetch_names(session, business_id)
    out: list[RelatedOperationOut] = []

    def add_movements(start: datetime, end: datetime, only_user: uuid.UUID | None = None) -> None:
        q = (
            select(MoneyMovement)
            .where(MoneyMovement.business_id == business_id)
            .where(MoneyMovement.created_at >= start)
            .where(MoneyMovement.created_at <= end)
        )
        if only_user:
            q = q.where(MoneyMovement.user_id == only_user)
        for m in session.exec(q.order_by(MoneyMovement.created_at.desc())).all():
            base = _MONEY_LABELS.get(m.type.value, m.type.value)
            out.append(
                RelatedOperationOut(
                    at=m.created_at,
                    kind="credit_repayment" if m.type.value == "credit_repayment" else "money_movement",
                    label=base + (" — " + m.reason if m.reason else ""),
                    amount=m.amount,
                    channel=(m.channel.value if m.channel else "cash"),
                    user_name=user_names.get(m.user_id),
                )
            )

    if anomaly_type == "closing_gap":
        closing = session.get(DailyClosing, source_id)
        if closing is None or closing.business_id != business_id:
            return []
        start = datetime.combine(closing.closing_date, datetime.min.time())
        add_movements(start, start + timedelta(days=1) - timedelta(microseconds=1))
    elif anomaly_type == "shift_gap":
        shift = session.get(Shift, source_id)
        if shift is None or shift.business_id != business_id:
            return []
        add_movements(shift.opened_at, shift.closed_at or datetime.utcnow(), only_user=shift.user_id)
    elif anomaly_type == "stock_adjustment":
        mv = session.get(StockMovement, source_id)
        if mv is None or mv.business_id != business_id:
            return []
        rows = session.exec(
            select(StockMovement)
            .where(StockMovement.business_id == business_id)
            .where(StockMovement.product_id == mv.product_id)
            .order_by(StockMovement.created_at.desc())
            .limit(30)
        ).all()
        for r in rows:
            out.append(
                RelatedOperationOut(
                    at=r.created_at,
                    kind="stock_movement",
                    label=_STOCK_LABELS.get(r.type.value, r.type.value)
                    + " — "
                    + product_names.get(r.product_id, "produit")
                    + (" (" + r.reason + ")" if r.reason else ""),
                    amount=r.quantity_delta,
                    user_name=user_names.get(r.user_id),
                )
            )
    elif anomaly_type == "price_deviation":
        sale = session.get(Sale, source_id)
        if sale is None or sale.business_id != business_id:
            return []
        out.append(
            RelatedOperationOut(
                at=sale.created_at,
                kind="sale",
                label=f"Vente {sale.quantity} x {product_names.get(sale.product_id, 'produit')} a {sale.unit_price} FCFA",
                amount=sale.total_amount,
                channel=sale.payment_method,
                user_name=user_names.get(sale.user_id),
            )
        )
    out.sort(key=lambda o: o.at, reverse=True)
    return out
