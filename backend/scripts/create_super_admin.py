"""Crée (ou met à jour le mot de passe d') un compte Super Admin.

Pas d'endpoint API de création en libre-service pour apps/admin — c'est volontaire (séparation
stricte des comptes, voir models.admin.SuperAdminUser et opencode.md chantier D). Ce script est
le seul moyen de créer le tout premier compte ; les suivants pourront être créés par un `owner`
depuis apps/admin une fois l'écran de gestion des rôles construit (P1, pas encore fait).

Usage (depuis backend/, venv activé) :
    python scripts/create_super_admin.py --email you@korise.app --name "Prénom Nom" --role owner

Demande le mot de passe de façon interactive (jamais en argument de ligne de commande, pour ne
pas le laisser traîner dans l'historique du shell).
"""

import argparse
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session, select  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.db.session import engine  # noqa: E402
from app.models.admin import SuperAdminRole, SuperAdminUser  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True, dest="full_name")
    parser.add_argument(
        "--role", choices=[r.value for r in SuperAdminRole], default=SuperAdminRole.owner.value
    )
    args = parser.parse_args()

    password = getpass.getpass("Mot de passe : ")
    confirm = getpass.getpass("Confirmer : ")
    if password != confirm:
        print("Les deux mots de passe ne correspondent pas.", file=sys.stderr)
        raise SystemExit(1)
    if len(password) < 8:
        print("Le mot de passe doit faire au moins 8 caractères.", file=sys.stderr)
        raise SystemExit(1)

    email = args.email.lower().strip()
    with Session(engine) as session:
        existing = session.exec(select(SuperAdminUser).where(SuperAdminUser.email == email)).first()
        if existing:
            existing.password_hash = hash_password(password)
            existing.full_name = args.full_name
            existing.role = SuperAdminRole(args.role)
            existing.is_active = True
            session.add(existing)
            session.commit()
            print(f"Compte existant mis à jour : {email}")
        else:
            admin = SuperAdminUser(
                email=email,
                full_name=args.full_name,
                password_hash=hash_password(password),
                role=SuperAdminRole(args.role),
            )
            session.add(admin)
            session.commit()
            print(f"Compte Super Admin créé : {email} ({args.role})")


if __name__ == "__main__":
    main()
