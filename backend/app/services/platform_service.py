import json
import uuid
from datetime import datetime

from sqlmodel import Session, select

from app.models.platform import Device, PlatformEvent

VALID_PLATFORMS = {"web", "android", "windows"}


def _now() -> datetime:
    # Colonnes TIMESTAMP WITHOUT TIME ZONE (UTC) — voir alembic initial_schema.
    return datetime.utcnow()


def record_event(
    session: Session,
    type: str,
    *,
    business_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    device_key: str | None = None,
    platform: str | None = None,
    app_version: str | None = None,
    meta: dict | None = None,
) -> None:
    """Append a measurable platform event. Never raises: telemetry must not break a request."""
    try:
        session.add(
            PlatformEvent(
                type=type,
                business_id=business_id,
                user_id=user_id,
                device_key=device_key,
                platform=platform,
                app_version=app_version,
                meta=json.dumps(meta, ensure_ascii=False) if meta else None,
                created_at=_now(),
            )
        )
        session.flush()
    except Exception:  # noqa: BLE001
        pass


def upsert_device(
    session: Session,
    business_id: uuid.UUID,
    user_id: uuid.UUID | None,
    device_key: str,
    platform: str,
    app_version: str | None,
) -> Device:
    platform = platform if platform in VALID_PLATFORMS else "web"
    device = session.exec(
        select(Device).where(Device.business_id == business_id, Device.device_key == device_key)
    ).first()
    now = _now()
    if device is None:
        device = Device(
            business_id=business_id,
            user_id=user_id,
            device_key=device_key,
            platform=platform,
            app_version=app_version,
            first_seen_at=now,
            last_seen_at=now,
        )
    else:
        device.last_seen_at = now
        device.platform = platform
        if app_version:
            device.app_version = app_version
        if user_id:
            device.user_id = user_id
    session.add(device)
    session.flush()
    return device


def heartbeat(
    session: Session,
    business_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    device_key: str,
    platform: str,
    app_version: str | None,
    pending_ops: int,
    rejected_ops: int,
    sync_ok: bool | None,
    sync_error: str | None,
    pushed: int,
) -> Device:
    """Called by every client after each sync attempt. Feeds Monitoring / Devices & Versions."""
    device = upsert_device(session, business_id, user_id, device_key, platform, app_version)
    device.pending_ops = max(0, pending_ops)
    device.rejected_ops = max(0, rejected_ops)
    if sync_ok is not None:
        device.last_sync_ok = sync_ok
        device.last_sync_error = None if sync_ok else (sync_error or "Erreur inconnue")[:300]
        if sync_ok:
            device.last_sync_at = _now()
    session.add(device)

    common = dict(
        business_id=business_id,
        user_id=user_id,
        device_key=device_key,
        platform=device.platform,
        app_version=device.app_version,
    )
    if sync_ok is False:
        record_event(session, "sync.failed", meta={"error": (sync_error or "")[:300]}, **common)
    elif sync_ok and pushed > 0:
        record_event(session, "sync.completed", meta={"pushed": pushed}, **common)
    if rejected_ops > 0:
        record_event(session, "sync.rejected", meta={"count": rejected_ops}, **common)
    session.commit()
    session.refresh(device)
    return device
