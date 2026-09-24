import uuid

from pydantic import BaseModel, Field

from app.models.user import UserRole


class RegisterBusinessRequest(BaseModel):
    business_name: str
    sector: str | None = None
    owner_full_name: str
    owner_phone: str | None = None
    pin: str = Field(min_length=4, max_length=8)


class LoginRequest(BaseModel):
    business_code: str
    pin: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: uuid.UUID
    business_id: uuid.UUID
    business_code: str
    business_name: str
    role: UserRole
    full_name: str
    can_view_purchase_prices: bool
    can_view_owner_dashboard: bool


class CreateEmployeeRequest(BaseModel):
    full_name: str
    phone: str | None = None
    pin: str = Field(min_length=4, max_length=8)
    can_view_purchase_prices: bool = False
    can_view_owner_dashboard: bool = False


class UpdateEmployeeRequest(BaseModel):
    """Édition/désactivation d'un employé. Pas de `role` (immuable — voir
    auth_service.update_employee) et pas de `pin` (le PIN employé est créé une
    fois à sa création, on ne le réédite pas dans le MVP)."""

    can_view_purchase_prices: bool | None = None
    can_view_owner_dashboard: bool | None = None
    is_active: bool | None = None


class UserOut(BaseModel):
    id: uuid.UUID
    business_id: uuid.UUID
    full_name: str
    phone: str | None
    role: UserRole
    can_view_purchase_prices: bool
    can_view_owner_dashboard: bool
    is_active: bool
