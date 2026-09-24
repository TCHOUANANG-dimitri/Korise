import uuid

from sqlmodel import Session, select

from app.db.session import engine
from app.models.billing import Plan, Subscription, SubscriptionStatus


def _register_business(client, pin="1234"):
    r = client.post(
        "/auth/register-business",
        json={"business_name": "Cyber Test Billing", "owner_full_name": "Patron A", "pin": pin},
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_register_business_creates_active_subscription_on_free_plan(client):
    """Aucune étape de billing n'est jamais imposée à l'inscription : l'entreprise démarre
    directement sur le plan gratuit, abonnement actif."""
    business = _register_business(client)

    with Session(engine) as session:
        subscription = session.exec(
            select(Subscription).where(
                Subscription.business_id == uuid.UUID(business["business_id"])
            )
        ).first()
        assert subscription is not None
        plan = session.get(Plan, subscription.plan_id)

    assert subscription.status == SubscriptionStatus.active
    assert subscription.trial_ends_at is None
    assert plan is not None
    assert plan.name == "Gratuit"
    assert plan.price == 0


def test_register_business_creates_exactly_one_subscription(client):
    business = _register_business(client, pin="4321")

    with Session(engine) as session:
        subscriptions = session.exec(
            select(Subscription).where(
                Subscription.business_id == uuid.UUID(business["business_id"])
            )
        ).all()

    assert len(subscriptions) == 1


def test_free_plan_is_reused_across_businesses(client):
    """get_or_create_free_plan ne doit jamais créer un deuxième plan "Gratuit"."""
    b1 = _register_business(client, pin="1111")
    b2 = _register_business(client, pin="2222")

    with Session(engine) as session:
        s1 = session.exec(
            select(Subscription).where(Subscription.business_id == uuid.UUID(b1["business_id"]))
        ).first()
        s2 = session.exec(
            select(Subscription).where(Subscription.business_id == uuid.UUID(b2["business_id"]))
        ).first()
        free_plans = session.exec(select(Plan).where(Plan.name == "Gratuit")).all()

    assert s1.plan_id == s2.plan_id
    assert len(free_plans) == 1
