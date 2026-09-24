import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session

from app.core.security import InvalidToken, decode_access_token
from app.db.session import get_session
from app.models.admin import SuperAdminUser

admin_bearer_scheme = HTTPBearer()


class CurrentSuperAdmin:
    def __init__(self, id: uuid.UUID, role: str):
        self.id = id
        self.role = role


def require_admin_roles(*roles: str):
    """Least privilege (cahier Super Admin §16): a route lists the roles allowed to use it."""

    def dependency(admin: "CurrentSuperAdmin" = Depends(get_current_super_admin)) -> "CurrentSuperAdmin":
        if admin.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Ton rôle n'a pas accès à cette section")
        return admin

    return dependency


def get_current_super_admin(
    credentials: HTTPAuthorizationCredentials = Depends(admin_bearer_scheme),
    session: Session = Depends(get_session),
) -> CurrentSuperAdmin:
    try:
        payload = decode_access_token(credentials.credentials)
    except InvalidToken:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session invalide, reconnecte-toi")

    # Un token entreprise (voir api.deps.get_current_user) n'a jamais ce claim — rejeté ici
    # même s'il est par ailleurs valide et signé avec la même clé. Sépare strictement les
    # deux systèmes d'auth (voir models.admin.SuperAdminUser).
    if payload.get("typ") != "super_admin":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session invalide, reconnecte-toi")

    admin = session.get(SuperAdminUser, uuid.UUID(payload["sub"]))
    if admin is None or not admin.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Compte introuvable ou désactivé")

    return CurrentSuperAdmin(id=admin.id, role=admin.role.value)
