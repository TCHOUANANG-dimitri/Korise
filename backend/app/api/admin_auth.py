from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.db.session import get_session
from app.schemas.admin import AdminLoginRequest, AdminTokenResponse
from app.services.admin_auth_service import admin_login

router = APIRouter(prefix="/admin/auth", tags=["admin-auth"])


@router.post("/login", response_model=AdminTokenResponse)
def login(request: AdminLoginRequest, session: Session = Depends(get_session)):
    return admin_login(session, request)
