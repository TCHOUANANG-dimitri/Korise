import uuid

from sqlmodel import Session, select

from app.models.catalog import Product
from app.models.customer import Customer
from app.models.events import AuditLog, MoneyMovement, Sale, StockMovement
from app.models.user import User

ENTITY_LIMIT_PER_PAGE = 500


def list_audit_log(
    session: Session,
    business_id: uuid.UUID,
    limit: int,
    action: str | None = None,
) -> list[dict]:
    """Dernières actions sensibles de l'entreprise, avec l'auteur et un libellé.

    Les entrées sont immuables (jamais éditées/supprimées) : la lecture seule suffit.
    Le libellé (label) est une projection de lecture construite à la volée depuis les
    entités référencées — on ne modifie jamais le journal lui-même.
    """
    query = (
        select(AuditLog, User.full_name)
        .join(User, User.id == AuditLog.user_id)
        .where(AuditLog.business_id == business_id)
    )
    if action:
        query = query.where(AuditLog.action == action)

    rows = session.exec(
        query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(limit)
    ).all()

    entries = [
        {
            "id": entry.id,
            "created_at": entry.created_at,
            "action": entry.action,
            "entity_type": entry.entity_type,
            "entity_id": entry.entity_id,
            "details": entry.details,
            "user_id": entry.user_id,
            "user_full_name": full_name,
        }
        for entry, full_name in rows
    ]

    labels = _entity_labels(session, business_id, entries)
    for entry in entries:
        entry["label"] = labels.get((entry["entity_type"], str(entry["entity_id"])))

    return entries


def _entity_labels(
    session: Session, business_id: uuid.UUID, entries: list[dict]
) -> dict[tuple[str, str], str]:
    """Projette les entités référencées par des entrées du journal en libellés lisibles.

    Limite : on ne lit que les entités du même business (jamais de fuite inter-business).
    """
    by_type: dict[str, dict[str, set[str]]] = {}
    for e in entries:
        by_type.setdefault(e["entity_type"], {})
        by_type[e["entity_type"]][str(e["entity_id"])] = set()

    labels: dict[tuple[str, str], str] = {}

    ids_by_type = {t: [uuid.UUID(s) for s in ids] for t, ids in by_type.items()}

    if "product" in ids_by_type:
        products = session.exec(
            select(Product).where(
                Product.business_id == business_id,
                Product.id.in_(ids_by_type["product"]),
            )
        ).all()
        for p in products:
            labels[("product", str(p.id))] = p.name

    if "user" in ids_by_type:
        users = session.exec(
            select(User).where(User.business_id == business_id, User.id.in_(ids_by_type["user"]))
        ).all()
        for u in users:
            labels[("user", str(u.id))] = u.full_name

    if "customer" in ids_by_type:
        customers = session.exec(
            select(Customer).where(
                Customer.business_id == business_id,
                Customer.id.in_(ids_by_type["customer"]),
            )
        ).all()
        for c in customers:
            labels[("customer", str(c.id))] = c.full_name

    if "sale" in ids_by_type:
        sales = session.exec(
            select(Sale, Product.name)
            .join(Product, Product.id == Sale.product_id)
            .where(Sale.business_id == business_id, Sale.id.in_(ids_by_type["sale"]))
        ).all()
        for s, product_name in sales:
            labels[("sale", str(s.id))] = (
                f"{s.quantity} × {s.unit_price} = {s.quantity * s.unit_price} ({product_name})"
            )

    if "money_movement" in ids_by_type:
        movements = session.exec(
            select(MoneyMovement).where(
                MoneyMovement.business_id == business_id,
                MoneyMovement.id.in_(ids_by_type["money_movement"]),
            )
        ).all()
        for m in movements:
            ctx = _money_label(m)
            if m.reason:
                ctx += f" · {m.reason}"
            labels[("money_movement", str(m.id))] = ctx

    if "stock_movement" in ids_by_type:
        movements = session.exec(
            select(StockMovement, Product.name)
            .join(Product, Product.id == StockMovement.product_id)
            .where(
                StockMovement.business_id == business_id,
                StockMovement.id.in_(ids_by_type["stock_movement"]),
            )
        ).all()
        for m, product_name in movements:
            sign = "+" if m.quantity_delta > 0 else ""
            labels[("stock_movement", str(m.id))] = f"{sign}{m.quantity_delta} {product_name}"

    return labels


def _money_label(m: MoneyMovement) -> str:
    if m.type.value == "income":
        return f"Entrée +{m.amount}"
    if m.type.value == "expense":
        return f"Dépense {m.amount}"
    if m.type.value == "withdrawal":
        return f"Retrait {m.amount}"
    if m.type.value == "credit_repayment":
        channel = m.channel.value if m.channel else "cash"
        return f"Remboursement crédit +{m.amount} ({channel})"
    return f"Vente +{m.amount}"