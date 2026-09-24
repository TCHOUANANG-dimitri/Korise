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


class BusinessUpdate(BaseModel):
    name: str | None = None
    sector: str | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    logo_data: str | None = None
    """`data:image/png;base64,...` (<= 300 KB) or empty string to remove the logo."""
