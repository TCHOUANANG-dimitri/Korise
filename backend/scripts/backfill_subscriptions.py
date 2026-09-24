"""Attache un abonnement (plan Gratuit, actif) à toute entreprise créée avant le modèle
d'abonnement. Idempotent : ne touche que les entreprises sans abonnement.

Usage (depuis backend/, venv activé) :  python scripts/backfill_subscriptions.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session, select  # noqa: E402

from app.db.session import engine  # noqa: E402
from app.models.billing import Subscription  # noqa: E402
from app.models.business import Business  # noqa: E402
from app.services.billing_service import create_default_subscription  # noqa: E402


def main() -> None:
    created = 0
    with Session(engine) as session:
        for business in session.exec(select(Business)).all():
            has = session.exec(select(Subscription).where(Subscription.business_id == business.id)).first()
            if has is None:
                create_default_subscription(session, business.id)
                created += 1
        session.commit()
    print(f"{created} abonnement(s) créé(s)")


if __name__ == "__main__":
    main()
