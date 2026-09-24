import uuid

from sqlmodel import Session, select

from app.models.billing import Plan, PlanPeriod, Subscription, SubscriptionStatus

DEFAULT_FREE_PLAN_NAME = "Gratuit"
"""Nom du plan gratuit par défaut — utilisé comme clé d'identification (pas d'ID fixe en dur,
voir get_or_create_free_plan). Géré/visible depuis apps/admin (chantier D), jamais depuis
apps/web ou apps/mobile : aucune étape de billing n'est imposée côté app métier (décision du
fondateur, 2026-09-23 — voir opencode.md)."""


def get_or_create_free_plan(session: Session) -> Plan:
    """Le plan gratuit auquel toute nouvelle entreprise est abonnée par défaut. Créé à la
    volée au premier appel plutôt que par une migration de données — plus simple, et
    fonctionne aussi bien contre la base de test (SQLite, tables créées hors Alembic) que
    contre Supabase."""
    plan = session.exec(select(Plan).where(Plan.name == DEFAULT_FREE_PLAN_NAME)).first()
    if plan is None:
        plan = Plan(name=DEFAULT_FREE_PLAN_NAME, price=0, period=PlanPeriod.monthly, is_active=True)
        session.add(plan)
        session.flush()
    return plan


def create_default_subscription(session: Session, business_id: uuid.UUID) -> Subscription:
    """Crée l'abonnement d'une entreprise tout juste inscrite.

    Directement sur le plan gratuit, actif immédiatement — jamais de billing à passer dans
    l'app métier. Un Super Admin pourra plus tard faire passer l'entreprise sur un plan payant
    depuis apps/admin (chantier D). Appelé une seule fois, dans `register_business` — ne fait
    pas son propre `commit()`, laisse l'appelant décider du point de commit (même transaction
    que la création de l'entreprise et du propriétaire).
    """
    free_plan = get_or_create_free_plan(session)
    subscription = Subscription(
        business_id=business_id,
        plan_id=free_plan.id,
        status=SubscriptionStatus.active,
        trial_ends_at=None,
    )
    session.add(subscription)
    session.flush()
    return subscription


def get_subscription(session: Session, business_id: uuid.UUID) -> Subscription | None:
    return session.exec(
        select(Subscription).where(Subscription.business_id == business_id)
    ).first()
