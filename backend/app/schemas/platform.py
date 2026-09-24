from pydantic import BaseModel


class HeartbeatIn(BaseModel):
    device_key: str
    platform: str
    app_version: str | None = None
    pending_ops: int = 0
    rejected_ops: int = 0
    sync_ok: bool | None = None
    sync_error: str | None = None
    pushed: int = 0


class HeartbeatOut(BaseModel):
    ok: bool = True
