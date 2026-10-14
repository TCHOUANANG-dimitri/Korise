from fastapi import APIRouter
from sqlalchemy import text
from sqlmodel import Session

from app.db.session import engine

router = APIRouter()


@router.get("/health")
def health():
    return {"status": "ok"}


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
        return {"status": "ok", "db": "up"}
    except Exception as exc:  # noqa: BLE001
        msg = str(exc)[:200].replace(engine.url.password or "\x00", "***") if engine.url.password else str(exc)[:200]
        return {"status": "degraded", "db": "down", "error": f"{type(exc).__name__}: {msg}"}
