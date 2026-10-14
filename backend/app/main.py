from __future__ import annotations

import re

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


_cors_origin_re = re.compile(settings.cors_allow_origin_regex) if settings.cors_allow_origin_regex else None


def _cors_headers_for(request: Request) -> dict[str, str]:
    """En-têtes CORS minimaux pour une réponse d'erreur construite hors de CORSMiddleware.

    Starlette enregistre un handler `@app.exception_handler(Exception)` sur le
    ServerErrorMiddleware, qui est PLUS externe que CORSMiddleware : la 500 qu'il
    génère ne traverse donc jamais CORSMiddleware et part sans
    `access-control-allow-origin` — le navigateur la bloque et le client affiche
    « Backend injoignable » au lieu de la vraie erreur (incident du 2026-10-14).
    On reproduit ici exactement la décision d'origine de CORSMiddleware
    (liste + regex, même `fullmatch` que Starlette)."""
    origin = request.headers.get("origin")
    if not origin:
        return {}
    allowed = origin in settings.cors_allow_origins or (
        _cors_origin_re is not None and _cors_origin_re.fullmatch(origin) is not None
    )
    if not allowed:
        return {}
    return {
        "access-control-allow-origin": origin,
        "access-control-allow-credentials": "true",
        "vary": "Origin",
    }


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Toute exception non gérée devient une 500 JSON qui garde ses en-têtes CORS
    (voir `_cors_headers_for`) pour que le client voie la vraie erreur."""
    _log_server_error(request, type(exc).__name__)
    return JSONResponse(
        {"detail": "Erreur interne du serveur"}, status_code=500, headers=_cors_headers_for(request)
    )


@app.middleware("http")
async def track_server_errors(request: Request, call_next):
    """Every 5xx status becomes a `server.error` platform event, so the Super Admin sees
    error spikes before a customer complains (cahier Super Admin §11, §18). Ce middleware
    ne construit jamais de réponse lui-même — il laisse passer celle de l'intérieur
    (déjà enrichie par CORS) pour ne jamais perdre les en-têtes CORS."""
    response = await call_next(request)
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
