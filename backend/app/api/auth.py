import uuid

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.api.deps import ClientInfo, CurrentUser, get_client_info, require_owner
from app.db.session import get_session
from app.schemas.auth import (
    CreateEmployeeRequest,
    LoginRequest,
    RecoverCodeRequest,
    RecoverCodeResponse,
    RegisterBusinessRequest,
    TokenResponse,
    UpdateEmployeeRequest,
    UserOut,
)
from app.services.auth_service import (
    create_employee,
    list_users,
    login,
    recover_business_code,
    register_business,
    update_employee,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register-business", response_model=TokenResponse)
def register(
    request: RegisterBusinessRequest,
    session: Session = Depends(get_session),
    client: ClientInfo = Depends(get_client_info),
):
    return register_business(session, request, client)


@router.post("/login", response_model=TokenResponse)
def login_route(
    request: LoginRequest,
    session: Session = Depends(get_session),
    client: ClientInfo = Depends(get_client_info),
):
    return login(session, request, client)


@router.post("/recover-code", response_model=RecoverCodeResponse)
def recover_code_route(
    request: RecoverCodeRequest,
    session: Session = Depends(get_session),
    client: ClientInfo = Depends(get_client_info),
):
    """Code entreprise oublié — sans authentification (c'est tout l'objet).
    Vérification d'identité légère : le code seul ne permet aucune action sans le PIN."""
    return recover_business_code(session, request, client)


@router.post("/employees", response_model=UserOut)
def create_employee_route(
    request: CreateEmployeeRequest,
    current_user: CurrentUser = Depends(require_owner),
    session: Session = Depends(get_session),
):
    return create_employee(session, current_user.business_id, current_user.id, request)


@router.patch("/employees/{user_id}", response_model=UserOut)
def update_employee_route(
    user_id: uuid.UUID,
    request: UpdateEmployeeRequest,
    current_user: CurrentUser = Depends(require_owner),
    session: Session = Depends(get_session),
):
    """Modifier un employé. Le rôle est immuable — un employé ne peut jamais
    devenir owner via cette route, et aucun employé ne peut se modifier lui-même."""
    return update_employee(session, current_user.business_id, current_user.id, user_id, request)


@router.get("/employees", response_model=list[UserOut])
def list_employees_route(
    current_user: CurrentUser = Depends(require_owner),
    session: Session = Depends(get_session),
):
    return list_users(session, current_user.business_id)
