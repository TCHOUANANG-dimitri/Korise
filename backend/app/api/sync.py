from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.api.deps import CurrentUser, get_current_user
from app.db.session import get_session
from app.schemas.sync import PullResponse, PushRequest, PushResponse
from app.services.sync_service import pull_batch, push_batch

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("/push", response_model=PushResponse)
def push(
    request: PushRequest,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return push_batch(session, current_user.business_id, current_user.id, request)


@router.get("/pull", response_model=PullResponse)
def pull(
    since_sales: str | None = None,
    since_money_movements: str | None = None,
    since_stock_movements: str | None = None,
    since_daily_closings: str | None = None,
    since_customers: str | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return pull_batch(
        session,
        current_user.business_id,
        since_sales,
        since_money_movements,
        since_stock_movements,
        since_daily_closings,
        since_customers,
    )
