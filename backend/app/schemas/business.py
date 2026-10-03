from datetime import datetime

from pydantic import BaseModel


class BusinessOut(BaseModel):
    id: str
    name: str
    business_code: str
    sector: str | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    logo_data: str | None = None
    deletion_scheduled_for: datetime | None = None


class BusinessDeletionRequest(BaseModel):
    pin: str
    export_first: bool = False
    """True when the owner chose « télécharger l'historique puis supprimer » (kept in the audit)."""


class BusinessUpdate(BaseModel):
    name: str | None = None
    sector: str | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    logo_data: str | None = None
    """`data:image/png;base64,...` (<= 300 KB) or empty string to remove the logo."""
