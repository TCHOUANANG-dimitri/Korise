from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.core.config import settings
from app.core.security import create_admin_access_token, verify_password
from app.models.admin import SuperAdminUser
from app.models.platform import AdminAuditLog
from app.schemas.admin import AdminLoginRequest, AdminTokenResponse


def admin_login(session: Session, request: AdminLoginRequest) -> AdminTokenResponse:
    admin = session.exec(
        select(SuperAdminUser).where(SuperAdminUser.email == request.email.lower().strip())
    ).first()
    if admin is None or not admin.is_active or not verify_password(request.password, admin.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email ou mot de passe incorrect")

    # Connection history for sensitive accounts (cahier Super Admin §19).
    session.add(AdminAuditLog(admin_id=admin.id, action="admin.login", target_type="admin", target_id=admin.id))
    session.commit()

    token = create_admin_access_token(admin.id, admin.role.value)
    return AdminTokenResponse(
        access_token=token,
        super_admin_id=admin.id,
        email=admin.email,
        full_name=admin.full_name,
        role=admin.role,
        environment=settings.environment,
    )
