import uuid

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.api.deps import CurrentUser, get_current_user
from app.db.session import get_session
from app.schemas.customer import CustomerDetailOut, CustomerOut
from app.schemas.sync import CustomerIn
from app.services.credit_service import (
    create_customer,
    get_customer_detail,
    list_customers,
)

router = APIRouter(prefix="/customers", tags=["customers"])


@router.post("", response_model=CustomerOut)
def create(
    request: CustomerIn,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Créer un client crédit (sur place, pour une vente à crédit immédiate)."""
    customer = create_customer(session, current_user.business_id, current_user.id, request)
    return CustomerOut(
        id=customer.id,
        client_uuid=customer.client_uuid,
        full_name=customer.full_name,
        phone=customer.phone,
        balance=0,
    )


@router.get("", response_model=list[CustomerOut])
def list_all(
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Liste des clients et leur solde dû — calculé à la volée depuis les
    événements (ventes à crédit − remboursements), jamais stocké."""
    return list_customers(session, current_user.business_id)


@router.get("/{customer_id}", response_model=CustomerDetailOut)
def get_one(
    customer_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Fiche client : solde dû + historique (ventes à crédit et remboursements)."""
    return get_customer_detail(session, current_user.business_id, customer_id)