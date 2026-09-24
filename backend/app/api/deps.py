import uuid

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session

from app.core.security import InvalidToken, decode_access_token
from app.db.session import get_session
from app.models.business import Business
from app.models.user import User, UserRole

bearer_scheme = HTTPBearer()


class ClientInfo:
    """Who is calling: device / platform / app version sent by our own clients as headers."""

    def __init__(self, device_key: str | None, platform: str | None, app_version: str | None):
        self.device_key = device_key
        self.platform = platform
        self.app_version = app_version


def get_client_info(
    x_device_id: str | None = Header(default=None),
    x_platform: str | None = Header(default=None),
    x_app_version: str | None = Header(default=None),
) -> ClientInfo:
    return ClientInfo(x_device_id, x_platform, x_app_version)


class CurrentUser:
    def __init__(
        self,
        id: uuid.UUID,
        business_id: uuid.UUID,
        role: UserRole,
        can_view_purchase_prices: bool,
        can_view_owner_dashboard: bool,
    ):
        self.id = id
        self.business_id = business_id
        self.role = role
        self.can_view_purchase_prices = can_view_purchase_prices
        self.can_view_owner_dashboard = can_view_owner_dashboard


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> CurrentUser:
    try:
        payload = decode_access_token(credentials.credentials)
    except InvalidToken:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session invalide, reconnecte-toi")

    user = session.get(User, uuid.UUID(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Compte introuvable ou désactivé")

    business = session.get(Business, user.business_id)
    if business is not None and business.is_suspended:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Compte suspendu — contactez le support Korise")

    return CurrentUser(
        id=user.id,
        business_id=user.business_id,
        role=user.role,
        can_view_purchase_prices=user.can_view_purchase_prices,
        can_view_owner_dashboard=user.can_view_owner_dashboard,
    )


def require_owner(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if current_user.role != UserRole.owner:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Réservé au propriétaire")
    return current_user


def require_dashboard_access(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not current_user.can_view_owner_dashboard:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Accès au tableau de bord non autorisé")
    return current_user
