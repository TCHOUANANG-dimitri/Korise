import uuid
from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class Customer(SQLModel, table=True):
    """A credit customer: someone who buys on credit and owes the business money.

    The balance is never stored — it is always derived from the Sale/Payment
    events (credit is a read-only projection over the event log).
    """

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    client_uuid: uuid.UUID = Field(unique=True, index=True)
    """Generated on the device at capture time. Used as the offline-sync idempotency key."""
    business_id: uuid.UUID = Field(foreign_key="business.id", index=True)
    full_name: str
    phone: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))