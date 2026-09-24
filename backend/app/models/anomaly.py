import uuid
from datetime import datetime, timezone

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


class AnomalyResolution(SQLModel, table=True):
    """A minimal manual resolution record for a derived anomaly.

    Anomalies themselves are never stored (they are derived on the fly from
    business data — see services/anomaly_service.py). This table only tracks
    which anomaly the owner has marked as resolved, and by whom / when. The
    unique constraint guarantees an anomaly can be resolved only once.
    """

    __table_args__ = (UniqueConstraint("business_id", "anomaly_type", "source_id", name="uq_anomaly_resolution"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    business_id: uuid.UUID = Field(foreign_key="business.id", index=True)
    anomaly_type: str
    """"closing_gap" | "stock_adjustment" | "price_deviation" — matches the
    AnomalyKind enum in services/anomaly_service.py."""
    source_id: uuid.UUID
    """The uuid of the source business row (daily_closing.id, stock_movement.id, sale.id)."""
    source_extra: str | None = None
    """Free metadata captured at resolution time (e.g. the closing_date or product name),
    so the resolution line stays legible even if the source row changes."""
    resolved_by: uuid.UUID = Field(foreign_key="user.id")
    resolved_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    note: str | None = None