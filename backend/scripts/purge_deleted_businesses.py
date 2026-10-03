"""Efface les entreprises dont le délai de grâce de suppression (7 jours) est écoulé.

La purge tourne déjà toute seule (connexion, requêtes de l'entreprise, liste Super Admin) ;
ce script sert à la lancer à la main.

Usage (depuis backend/, venv activé) :
    python scripts/purge_deleted_businesses.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session  # noqa: E402

from app.db.session import engine  # noqa: E402
from app.services.account_service import purge_due_businesses  # noqa: E402

if __name__ == "__main__":
    with Session(engine) as session:
        print(f"{purge_due_businesses(session)} entreprise(s) effacée(s).")
