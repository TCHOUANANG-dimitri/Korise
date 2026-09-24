from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlmodel import Session

from app.api.admin import router as admin_router
from app.api.admin_auth import router as admin_auth_router
from app.api.anomalies import router as anomalies_router
from app.api.auth import router as auth_router
from app.api.audit import router as audit_router
from app.api.business import router as business_router
from app.api.reports import router as reports_router
from app.api.shifts import router as shifts_router
from app.api.telemetry import router as telemetry_router
from app.api.closing import router as closing_router
from app.api.customers import router as customers_router
from app.api.dashboard import router as dashboard_router
from app.api.health import router as health_router
from app.api.products import router as products_router
from app.api.sync import router as sync_router
from app.core.config import settings
from app.db.session import engine
from app.services.platform_service import record_event

app = FastAPI(title=settings.app_name)

# Le web (Next, port 3000) et le desktop (Tauri) tournent sur un autre origine
# que l'API : sans CORS, les appels navigateur sont bloqués (préflight OPTIONS 405).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    # Toute app web déployée sur Vercel (web, admin, prévisualisations) : l'auth passe par un jeton Bearer,
    # jamais par cookie, donc autoriser ces origines n'expose pas de session.
    allow_origin_regex=settings.cors_allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def track_server_errors(request: Request, call_next):
    """Every unhandled exception / 5xx becomes a `server.error` platform event, so the Super
    Admin sees error spikes before a customer complains (cahier Super Admin §11, §18)."""
    try:
        response = await call_next(request)
    except Exception as exc:  # noqa: BLE001
        _log_server_error(request, type(exc).__name__)
        return JSONResponse({"detail": "Erreur interne du serveur"}, status_code=500)
    if response.status_code >= 500:
        _log_server_error(request, str(response.status_code))
    return response


def _log_server_error(request: Request, reason: str) -> None:
    try:
        with Session(engine) as session:
            record_event(
                session,
                "server.error",
                platform=request.headers.get("x-platform"),
                app_version=request.headers.get("x-app-version"),
                device_key=request.headers.get("x-device-id"),
                meta={"path": request.url.path, "method": request.method, "reason": reason},
            )
            session.commit()
    except Exception:  # noqa: BLE001 — logging must never make things worse
        pass


app.include_router(health_router)
app.include_router(auth_router)
app.include_router(products_router)
app.include_router(customers_router)
app.include_router(closing_router)
app.include_router(dashboard_router)
app.include_router(audit_router)
app.include_router(sync_router)
app.include_router(admin_auth_router)
app.include_router(admin_router)
app.include_router(anomalies_router)
app.include_router(business_router)
app.include_router(reports_router)
app.include_router(shifts_router)
app.include_router(telemetry_router)
