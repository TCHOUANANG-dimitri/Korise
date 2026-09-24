import random
import string
import uuid

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.core.security import create_access_token, hash_pin, verify_pin
from app.models.business import Business
from app.models.events import AuditLog
from app.models.user import User, UserRole
from app.services.billing_service import create_default_subscription
from app.services.platform_service import record_event, upsert_device
from app.schemas.auth import (
    CreateEmployeeRequest,
    LoginRequest,
    RegisterBusinessRequest,
    TokenResponse,
    UpdateEmployeeRequest,
)

CODE_ALPHABET = string.ascii_uppercase + string.digits


def _generate_business_code(session: Session) -> str:
    for _ in range(10):
        code = "".join(random.choices(CODE_ALPHABET, k=6))
        exists = session.exec(select(Business).where(Business.business_code == code)).first()
        if not exists:
            return code
    raise RuntimeError("Could not generate a unique business code, try again")


def _token_for(user: User, business: Business) -> TokenResponse:
    access_token = create_access_token(user.id, business.id, user.role.value)
    return TokenResponse(
        access_token=access_token,
        user_id=user.id,
        business_id=business.id,
        business_code=business.business_code,
        business_name=business.name,
        role=user.role,
        full_name=user.full_name,
        can_view_purchase_prices=user.can_view_purchase_prices,
        can_view_owner_dashboard=user.can_view_owner_dashboard,
    )


def register_business(session: Session, request: RegisterBusinessRequest, client=None) -> TokenResponse:
    business = Business(
        name=request.business_name,
        sector=request.sector,
        business_code=_generate_business_code(session),
    )
    session.add(business)
    session.flush()

    owner = User(
        business_id=business.id,
        full_name=request.owner_full_name,
        phone=request.owner_phone,
        pin_hash=hash_pin(request.pin),
        role=UserRole.owner,
        can_view_purchase_prices=True,
        can_view_owner_dashboard=True,
    )
    session.add(owner)
    session.flush()

    session.add(
        AuditLog(
            business_id=business.id,
            user_id=owner.id,
            action="business.registered",
            entity_type="business",
            entity_id=business.id,
        )
    )
    # Chaque entreprise a toujours exactement un abonnement, créé sur le plan gratuit par
    # défaut dès l'inscription — aucune étape de billing n'est jamais imposée ici, voir
    # billing_service.create_default_subscription. Même transaction que le reste : si l'un
    # échoue, rien n'est enregistré.
    create_default_subscription(session, business.id)
    record_event(
        session,
        "business.registered",
        business_id=business.id,
        user_id=owner.id,
        device_key=getattr(client, "device_key", None),
        platform=getattr(client, "platform", None),
        app_version=getattr(client, "app_version", None),
        meta={"sector": request.sector},
    )
    if getattr(client, "device_key", None):
        upsert_device(session, business.id, owner.id, client.device_key, client.platform or "web", client.app_version)
    session.commit()
    session.refresh(owner)
    session.refresh(business)
    return _token_for(owner, business)


def login(session: Session, request: LoginRequest, client=None) -> TokenResponse:
    business = session.exec(
        select(Business).where(Business.business_code == request.business_code.upper())
    ).first()
    if business is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Code entreprise ou PIN incorrect")

    candidates = session.exec(
        select(User).where(User.business_id == business.id, User.is_active == True)  # noqa: E712
    ).all()
    for user in candidates:
        if verify_pin(request.pin, user.pin_hash):
            if business.is_suspended:
                raise HTTPException(status.HTTP_403_FORBIDDEN, "Compte suspendu — contactez le support Korise")
            record_event(
                session,
                "user.login",
                business_id=business.id,
                user_id=user.id,
                device_key=getattr(client, "device_key", None),
                platform=getattr(client, "platform", None),
                app_version=getattr(client, "app_version", None),
            )
            if getattr(client, "device_key", None):
                upsert_device(session, business.id, user.id, client.device_key, client.platform or "web", client.app_version)
            session.commit()
            return _token_for(user, business)

    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Code entreprise ou PIN incorrect")


def create_employee(session: Session, business_id: uuid.UUID, owner_id: uuid.UUID, request: CreateEmployeeRequest) -> User:
    employee = User(
        business_id=business_id,
        full_name=request.full_name,
        phone=request.phone,
        pin_hash=hash_pin(request.pin),
        role=UserRole.employee,
        can_view_purchase_prices=request.can_view_purchase_prices,
        can_view_owner_dashboard=request.can_view_owner_dashboard,
    )
    session.add(employee)
    session.flush()
    session.add(
        AuditLog(
            business_id=business_id,
            user_id=owner_id,
            action="employee.created",
            entity_type="user",
            entity_id=employee.id,
        )
    )
    session.commit()
    session.refresh(employee)
    return employee


def list_users(session: Session, business_id: uuid.UUID) -> list[User]:
    """Tous les comptes actifs d'une entreprise, triés par nom — jamais le PIN."""
    return session.exec(
        select(User)
        .where(User.business_id == business_id, User.is_active == True)  # noqa: E712
        .order_by(User.full_name)
    ).all()


def update_employee(
    session: Session,
    business_id: uuid.UUID,
    owner_id: uuid.UUID,
    user_id: uuid.UUID,
    request: UpdateEmployeeRequest,
) -> User:
    """Modifier un employé (nom, téléphone, PIN, permissions, désactivation).

    Le rôle d'un utilisateur est IMMUABLE : le champ `role` n'est pas dans le
    schéma de requête, on le force ici à la lecture pour ne jamais créer un
    « owner » supplémentaire ni rétrograder le propriétaire.
    """
    user = session.get(User, user_id)
    if user is None or user.business_id != business_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employé introuvable")
    if user.role == UserRole.owner:
        # Le patron ne peut pas se modifier via ce canal employés : il n'est
        # ni lisible ni éditable ici pour éviter toute auto-désactivation.
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Le propriétaire ne se modifie pas ici")

    changes = request.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(user, field, value)

    session.add(user)
    session.flush()
    session.add(
        AuditLog(
            business_id=business_id,
            user_id=owner_id,
            action="employee.updated",
            entity_type="user",
            entity_id=user.id,
        )
    )
    session.commit()
    session.refresh(user)
    return user
