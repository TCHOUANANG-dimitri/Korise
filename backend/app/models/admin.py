import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlmodel import Field, SQLModel


class SuperAdminRole(str, Enum):
    owner = "owner"
    product_manager = "product_manager"
    support = "support"
    developer = "developer"


class SuperAdminUser(SQLModel, table=True):
    """A staff account for apps/admin (Korise Super Admin), entièrement séparé des comptes
    entreprise (`User`) — jamais la même table, le même hash, ni le même JWT (voir
    core.security.create_admin_access_token et api.admin_deps). Pas d'endpoint de création
    en libre-service : le tout premier compte est créé via
    `backend/scripts/create_super_admin.py`, les suivants par un `owner` déjà existant
    (endpoint de gestion des rôles hors scope P0, voir opencode.md chantier D)."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(unique=True, index=True)
    full_name: str
    password_hash: str
    role: SuperAdminRole = SuperAdminRole.support
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
