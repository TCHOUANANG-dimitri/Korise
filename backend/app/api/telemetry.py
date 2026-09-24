from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.api.deps import CurrentUser, get_current_user
from app.db.session import get_session
from app.schemas.platform import HeartbeatIn, HeartbeatOut
from app.services.platform_service import heartbeat

router = APIRouter(prefix="/telemetry", tags=["telemetry"])


@router.post("/heartbeat", response_model=HeartbeatOut)
def post_heartbeat(
    body: HeartbeatIn,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    heartbeat(
        session,
        current_user.business_id,
        current_user.id,
        device_key=body.device_key,
        platform=body.platform,
        app_version=body.app_version,
        pending_ops=body.pending_ops,
        rejected_ops=body.rejected_ops,
        sync_ok=body.sync_ok,
        sync_error=body.sync_error,
        pushed=body.pushed,
    )
    return HeartbeatOut()
