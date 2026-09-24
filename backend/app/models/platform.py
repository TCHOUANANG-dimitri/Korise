import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Device(SQLModel, table=True):
    """One installed client (web browser profile, Android app, Windows app) of a business.

    `device_key` is generated once on the client and sent on every heartbeat / login, so the
    Super Admin can answer "which devices does this business have, which version, when did
    they last sync, do they hold unsynced operations" without asking the customer for a
    screenshot (cahier Super Admin §11-12)."""

    __table_args__ = (UniqueConstraint("business_id", "device_key", name="uq_device_business_key"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    business_id: uuid.UUID = Field(foreign_key="business.id", index=True)
    user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id")
    """Last user seen on this device (shared tills are used by several people)."""
    device_key: str = Field(index=True)
    platform: str
    """"web" | "android" | "windows"."""
    app_version: str | None = None
    first_seen_at: datetime = Field(default_factory=_now)
    last_seen_at: datetime = Field(default_factory=_now)
    last_sync_at: datetime | None = None
    last_sync_ok: bool | None = None
    last_sync_error: str | None = None
    pending_ops: int = 0
    """Operations still waiting in the local outbox at the last heartbeat."""
    rejected_ops: int = 0
    """Operations the server rejected (conflicts to show, never silently dropped)."""


class PlatformEvent(SQLModel, table=True):
    """Append-only measurable events for the Super Admin (cahier §20). Never edited."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime = Field(default_factory=_now, index=True)
    type: str = Field(index=True)
    """business.registered | user.login | sync.completed | sync.failed | sync.rejected |
    server.error | business.suspended | business.reactivated | subscription.changed ..."""
    business_id: uuid.UUID | None = Field(default=None, index=True)
    user_id: uuid.UUID | None = None
    device_key: str | None = None
    platform: str | None = None
    app_version: str | None = None
    meta: str | None = None
    """Small JSON string (counts, error text, path)."""


class AdminAuditLog(SQLModel, table=True):
    """Every sensitive Super Admin action: who, what, on which target, when (cahier §19)."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    admin_id: uuid.UUID = Field(foreign_key="superadminuser.id", index=True)
    action: str
    target_type: str | None = None
    target_id: uuid.UUID | None = None
    details: str | None = None
    created_at: datetime = Field(default_factory=_now, index=True)


class AdminNote(SQLModel, table=True):
    """Internal support note attached to a business (never visible to the customer)."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    business_id: uuid.UUID = Field(foreign_key="business.id", index=True)
    admin_id: uuid.UUID = Field(foreign_key="superadminuser.id")
    text: str
    created_at: datetime = Field(default_factory=_now)


class TicketStatus(str, Enum):
    open = "open"
    in_progress = "in_progress"
    resolved = "resolved"


class SupportTicket(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    business_id: uuid.UUID = Field(foreign_key="business.id", index=True)
    subject: str
    description: str | None = None
    status: TicketStatus = TicketStatus.open
    created_by: uuid.UUID = Field(foreign_key="superadminuser.id")
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
