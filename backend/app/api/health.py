from fastapi import APIRouter
from sqlalchemy import text
from sqlmodel import Session

from app.db.session import engine
from app.models.billing import Subscription
from app.models.business import Business
from app.models.events import AuditLog
from app.models.platform import Device, PlatformEvent
from app.models.user import User

router = APIRouter()


@router.get("/health")
def health():
    return {"status": "ok"}


# Tables/colonnes critiques pour /auth/* — vérifiées par /health/ready pour dire
# depuis l'extérieur si les migrations Alembic ont bien été appliquées en prod.
_SCHEMA_EXPECTED = {m.__tablename__: sorted(c.name for c in m.__table__.columns) for m in (
    Business, User, Subscription, Device, PlatformEvent, AuditLog,
)}


@router.get("/health/ready")
def ready():
    """Sonde de diagnostic (sans auth) : vérifie que la BDD de production répond.

    Ajoutée pour l'incident 500 du 2026-10-14 — sans accès aux Runtime Logs Vercel,
    c'est le seul moyen de voir depuis l'extérieur pourquoi /auth/* échoue.
    Ne renvoie jamais l'URL de connexion (elle contient le mot de passe) :
    seulement le type d'exception et un message tronqué/expurgé.
    """
    try:
        with Session(engine) as session:
            session.execute(text("SELECT 1"))
            missing: dict[str, list[str]] = {}
            for table, columns in _SCHEMA_EXPECTED.items():
                existing = {
                    row[0]
                    for row in session.execute(
                        text("SELECT column_name FROM information_schema.columns WHERE table_name = :t"),
                        {"t": table},
                    ).all()
                }
                if not existing:
                    missing[table] = ["<table manquante>"]
                elif gap := [c for c in columns if c not in existing]:
                    missing[table] = gap
        return {"status": "ok" if not missing else "degraded", "db": "up", "schema_gap": missing}
    except Exception as exc:  # noqa: BLE001
        msg = str(exc)[:200].replace(engine.url.password or "\x00", "***") if engine.url.password else str(exc)[:200]
        return {"status": "degraded", "db": "down", "error": f"{type(exc).__name__}: {msg}"}
