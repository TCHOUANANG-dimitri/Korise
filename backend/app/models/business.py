import uuid
from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class Business(SQLModel, table=True):
    """A tenant: one physical small business owned by one account."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str
    business_code: str = Field(unique=True, index=True)
    """Short human-friendly code employees use to log in (e.g. "KRH4X2"), not the internal UUID."""
    sector: str | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    logo_data: str | None = None
    """Company logo as a small `data:image/...;base64,...` URL (<= ~200 KB), used in the
    branded PDFs (receipts, invoices, reports). Kept in the row: no file storage to run."""
    is_suspended: bool = Field(default=False, sa_column_kwargs={"server_default": "false"})
    """Set by a Super Admin. A suspended business cannot log in or sync until reactivated."""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
