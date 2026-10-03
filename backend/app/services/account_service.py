"""Account deletion (decision du fondateur, 2026-09-30).

- An employee account is deleted only by the owner: the login is closed for good, but the user
  row stays so every sale, movement and shift they recorded keeps its author. Nothing of the
  business history is erased.
- The owner deletes the whole business: PIN re-checked, then a 7-day grace period during which
  only the owner can log in (to download the history or cancel). After that, every row of the
  business is erased.

The purge runs lazily — on login, on authenticated requests of that business and when the
Super Admin lists businesses — because the API runs on Vercel functions with no scheduler.
`scripts/purge_deleted_businesses.py` runs it by hand."""

import json
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import delete
from sqlmodel import Session, select

from app.core.security import verify_pin
from app.models.anomaly import AnomalyResolution
from app.models.billing import Subscription
from app.models.business import Business
from app.models.catalog import Product
from app.models.customer import Customer
from app.models.events import AuditLog, DailyClosing, MoneyMovement, Sale, StockMovement
from app.models.platform import AdminNote, Device, PlatformEvent, SupportTicket
from app.models.shift import Shift
from app.models.user import User, UserRole
from app.services.platform_service import record_event

DELETION_GRACE_DAYS = 7
DELETION_PENDING_MESSAGE = "Ce compte entreprise est en cours de suppression — contactez le propriétaire"

# Children before parents: no foreign key cascades in the schema.
_BUSINESS_TABLES = [
    AnomalyResolution,
    AuditLog,
    MoneyMovement,
    StockMovement,
    Sale,
    DailyClosing,
    Shift,
    Customer,
    Product,
    Device,
    Subscription,
    AdminNote,
    SupportTicket,
    PlatformEvent,
    User,
]


def utcnow() -> datetime:
    """Naive UTC, like every datetime column of the schema."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def delete_employee(session: Session, business_id: uuid.UUID, owner_id: uuid.UUID, user_id: uuid.UUID) -> None:
    user = session.get(User, user_id)
    if user is None or user.business_id != business_id or user.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employé introuvable")
    if user.role == UserRole.owner:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Le propriétaire ne se supprime pas ici")

    user.is_active = False
    user.deleted_at = utcnow()
    user.phone = None
    session.add(user)
    session.add(
        AuditLog(
            business_id=business_id,
            user_id=owner_id,
            action="employee.deleted",
            entity_type="user",
            entity_id=user.id,
            details=user.full_name,
        )
    )
    session.commit()


def check_pin(session: Session, user_id: uuid.UUID, pin: str) -> None:
    user = session.get(User, user_id)
    if user is None or not verify_pin(pin, user.pin_hash):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "PIN incorrect")


def schedule_business_deletion(session: Session, business_id: uuid.UUID, owner_id: uuid.UUID, pin: str, export_first: bool) -> Business:
    check_pin(session, owner_id, pin)
    business = session.get(Business, business_id)
    if business.deletion_scheduled_for is None:
        business.deletion_scheduled_for = utcnow() + timedelta(days=DELETION_GRACE_DAYS)
        session.add(business)
        session.add(
            AuditLog(
                business_id=business_id,
                user_id=owner_id,
                action="business.deletion_scheduled",
                entity_type="business",
                entity_id=business_id,
                details=f"suppression le {business.deletion_scheduled_for.date().isoformat()}"
                + (" (historique téléchargé)" if export_first else ""),
            )
        )
        record_event(
            session,
            "business.deletion_scheduled",
            business_id=business_id,
            user_id=owner_id,
            meta={"export_first": export_first},
        )
        session.commit()
        session.refresh(business)
    return business


def cancel_business_deletion(session: Session, business_id: uuid.UUID, owner_id: uuid.UUID) -> Business:
    business = session.get(Business, business_id)
    if business.deletion_scheduled_for is not None:
        business.deletion_scheduled_for = None
        session.add(business)
        session.add(
            AuditLog(
                business_id=business_id,
                user_id=owner_id,
                action="business.deletion_cancelled",
                entity_type="business",
                entity_id=business_id,
            )
        )
        record_event(session, "business.deletion_cancelled", business_id=business_id, user_id=owner_id)
        session.commit()
        session.refresh(business)
    return business


def purge_business(session: Session, business: Business) -> None:
    """Erase every row of one business, in one transaction. Irreversible."""
    owner = session.exec(select(User).where(User.business_id == business.id, User.role == UserRole.owner)).first()
    trace = {
        "name": business.name,
        "business_code": business.business_code,
        "owner": owner.full_name if owner else None,
        "sales": len(session.exec(select(Sale.id).where(Sale.business_id == business.id)).all()),
    }
    for model in _BUSINESS_TABLES:
        session.exec(delete(model).where(model.business_id == business.id))
    session.exec(delete(Business).where(Business.id == business.id))
    # The only trace left: an anonymous platform event for the Super Admin (no business_id).
    session.add(PlatformEvent(type="business.deleted", meta=json.dumps(trace, ensure_ascii=False)))
    session.commit()


def purge_due_businesses(session: Session) -> int:
    due = session.exec(
        select(Business)
        .where(Business.deletion_scheduled_for.is_not(None))
        .where(Business.deletion_scheduled_for <= utcnow())
    ).all()
    for business in due:
        purge_business(session, business)
    return len(due)
