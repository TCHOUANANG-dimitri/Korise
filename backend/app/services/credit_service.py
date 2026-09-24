import uuid
from datetime import date

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.models.catalog import Product
from app.models.customer import Customer
from app.models.events import AuditLog, MoneyMovement, MoneyMovementType, Sale
from app.schemas.customer import CustomerDetailOut, CustomerOut, CustomerTransactionOut
from app.schemas.sync import CreditRepaymentIn, CustomerIn, PushResult


def _customer_balance(session: Session, business_id: uuid.UUID, customer_id: uuid.UUID) -> int:
    """How much this customer owes: total of credit sales minus total repayments."""
    credit_total = session.exec(
        select(Sale.total_amount)
        .where(
            Sale.business_id == business_id,
            Sale.customer_id == customer_id,
            Sale.payment_method == "credit",
        )
    ).all()
    repaid_total = session.exec(
        select(MoneyMovement.amount)
        .where(
            MoneyMovement.business_id == business_id,
            MoneyMovement.customer_id == customer_id,
            MoneyMovement.type == MoneyMovementType.credit_repayment,
        )
    ).all()
    return int(sum(credit_total)) - int(sum(repaid_total))


def resolve_customer(session: Session, business_id: uuid.UUID, customer_ref: uuid.UUID) -> Customer:
    """Résout une référence client vers la ligne serveur.

    En offline-first, un appareil crée un client hors-ligne puis l'attache à une
    vente à crédit EN UTILISANT SON client_uuid local (la seule valeur qu'il
    connaît à ce moment-là). Le serveur, lui, a généré un `id` distinct à la
    création. On essaie donc `id` d'abord (= référence serveur, jamais le cas
    quand le client est hors-ligne), puis `client_uuid` (= référence locale).
    """
    customer = session.get(Customer, customer_ref)
    if customer is not None and customer.business_id == business_id:
        return customer
    matched = session.exec(
        select(Customer).where(
            Customer.business_id == business_id,
            Customer.client_uuid == customer_ref,
        )
    ).first()
    if matched is not None:
        return matched
    raise ValueError("Client inconnu pour cette entreprise")


def create_customer(session: Session, business_id: uuid.UUID, user_id: uuid.UUID, request: CustomerIn) -> Customer:
    """Create a customer (idempotent on client_uuid for offline replay)."""
    existing = session.exec(select(Customer).where(Customer.client_uuid == request.client_uuid)).first()
    if existing:
        return existing

    customer = Customer(
        client_uuid=request.client_uuid,
        business_id=business_id,
        full_name=request.full_name,
        phone=request.phone,
    )
    session.add(customer)
    session.flush()
    session.add(
        AuditLog(
            business_id=business_id,
            user_id=user_id,
            action="customer.created",
            entity_type="customer",
            entity_id=customer.id,
        )
    )
    session.commit()
    session.refresh(customer)
    return customer


def list_customers(session: Session, business_id: uuid.UUID) -> list[CustomerOut]:
    customers = session.exec(
        select(Customer).where(Customer.business_id == business_id).order_by(Customer.full_name)
    ).all()
    return [
        CustomerOut(
            id=c.id,
            client_uuid=c.client_uuid,
            full_name=c.full_name,
            phone=c.phone,
            balance=_customer_balance(session, business_id, c.id),
        )
        for c in customers
    ]


def get_customer_detail(session: Session, business_id: uuid.UUID, customer_id: uuid.UUID) -> CustomerDetailOut:
    try:
        customer = resolve_customer(session, business_id, customer_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client introuvable") from None

    product_names = {
        product.id: product.name
        for product in session.exec(select(Product).where(Product.business_id == business_id)).all()
    }

    credit_sales = session.exec(
        select(Sale)
        .where(
            Sale.business_id == business_id,
            Sale.customer_id == customer.id,
            Sale.payment_method == "credit",
        )
        .order_by(Sale.created_at.desc(), Sale.id.desc())
    ).all()
    repayments = session.exec(
        select(MoneyMovement)
        .where(
            MoneyMovement.business_id == business_id,
            MoneyMovement.customer_id == customer.id,
            MoneyMovement.type == MoneyMovementType.credit_repayment,
        )
        .order_by(MoneyMovement.created_at.desc(), MoneyMovement.id.desc())
    ).all()

    transactions = [
        CustomerTransactionOut(
            kind="sale",
            created_at=sale.created_at,
            amount=sale.total_amount,
            product_name=product_names.get(sale.product_id),
            quantity=sale.quantity,
            note=f"Vente à crédit — {sale.quantity} pièce(s)",
        )
        for sale in credit_sales
    ] + [
        CustomerTransactionOut(
            kind="repayment",
            created_at=repayment.created_at,
            amount=repayment.amount,
            channel=repayment.channel.value if repayment.channel else "cash",
            note=repayment.reason,
        )
        for repayment in repayments
    ]
    transactions.sort(key=lambda t: t.created_at, reverse=True)

    return CustomerDetailOut(
        id=customer.id,
        client_uuid=customer.client_uuid,
        full_name=customer.full_name,
        phone=customer.phone,
        balance=_customer_balance(session, business_id, customer.id),
        created_at=customer.created_at,
        transactions=transactions,
    )


def record_repayment(
    session: Session, business_id: uuid.UUID, user_id: uuid.UUID, item: CreditRepaymentIn
) -> PushResult:
    existing = session.exec(
        select(MoneyMovement).where(MoneyMovement.client_uuid == item.client_uuid)
    ).first()
    if existing:
        return PushResult(client_uuid=item.client_uuid, status="duplicate")

    try:
        customer = resolve_customer(session, business_id, item.customer_id)
    except ValueError:
        raise ValueError("Client introuvable") from None

    with session.begin_nested():
        movement = MoneyMovement(
            client_uuid=item.client_uuid,
            business_id=business_id,
            user_id=user_id,
            type=MoneyMovementType.credit_repayment,
            channel=item.channel,
            amount=item.amount,
            reason=item.note,
            customer_id=customer.id,
        )
        session.add(movement)
        session.flush()
        session.add(
            AuditLog(
                business_id=business_id,
                user_id=user_id,
                action="credit_repayment.created",
                entity_type="customer",
                entity_id=customer.id,
            )
        )

    return PushResult(client_uuid=item.client_uuid, status="accepted")