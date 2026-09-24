import uuid
from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class Shift(SQLModel, table=True):
    """A work session of one employee on a till (cahier fonctionnel §6 « responsabilité par
    employé / shift »). Opened by the employee with the starting cash, closed with the counted
    cash. Operations are NOT linked row by row: they belong to the shift by user + time window
    [opened_at, closed_at], so no existing event table needed a new column."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    client_uuid: uuid.UUID = Field(unique=True, index=True)
    business_id: uuid.UUID = Field(foreign_key="business.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    opened_at: datetime
    opening_cash: int = 0
    closed_at: datetime | None = None
    counted_cash: int | None = None
    expected_cash: int | None = None
    """Computed server-side at closing: opening_cash + this user's cash movements in the window."""
    difference: int | None = None
    note: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
