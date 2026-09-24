import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlmodel import Field, SQLModel

TRIAL_DURATION_DAYS = 14
"""Non utilisé par l'inscription par défaut (décision du fondateur, 2026-09-23 : chaque
entreprise démarre directement sur le plan gratuit, abonnement `active`, jamais de billing
imposé — voir billing_service.create_default_subscription). Gardé pour un futur essai payant
géré manuellement depuis apps/admin, si le fondateur le demande un jour."""


class PlanPeriod(str, Enum):
    monthly = "monthly"
    annual = "annual"


class SubscriptionStatus(str, Enum):
    trial = "trial"
    active = "active"
    expired = "expired"
    payment_failed = "payment_failed"
    cancelled = "cancelled"


class Plan(SQLModel, table=True):
    """A paid tier a business can subscribe to. No payment processor integration yet
    (chantier C) — statuses are set manually by the Super Admin for now."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str
    price: int
    """FCFA, montant plein pour la période choisie (pas un prix mensualisé pour l'annuel)."""
    period: PlanPeriod
    is_active: bool = True
    """Un plan désactivé reste visible pour les abonnements existants qui le référencent déjà,
    mais ne doit plus être proposé pour un nouvel abonnement."""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Subscription(SQLModel, table=True):
    """One business's subscription lifecycle. Always exactly one per business — created
    automatically at register-business (plan gratuit, statut `active`), never left absent.
    Le statut `trial` existe dans l'enum pour un futur usage manuel côté Super Admin
    (chantier D) mais n'est plus posé automatiquement à l'inscription."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    business_id: uuid.UUID = Field(foreign_key="business.id", index=True, unique=True)
    plan_id: uuid.UUID | None = Field(default=None, foreign_key="plan.id")
    """Rempli dès l'inscription avec l'id du plan gratuit par défaut (voir
    billing_service.get_or_create_free_plan) — NULL seulement pour un abonnement plus ancien
    qui n'aurait jamais été rattaché à un plan."""
    status: SubscriptionStatus = SubscriptionStatus.active
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    trial_ends_at: datetime | None = None
    """NULL par défaut (pas de trial à l'inscription). Renseigné uniquement si un Super Admin
    place un jour manuellement un abonnement en statut `trial` (chantier D, pas encore
    construit)."""
    current_period_ends_at: datetime | None = None
    """Date de renouvellement pour un plan payant. NULL sur le plan gratuit (pas de
    renouvellement à gérer)."""
    converted_at: datetime | None = None
    """Renseigné une seule fois, au premier passage vers un plan payant."""
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
