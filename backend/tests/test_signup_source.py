import uuid

from sqlmodel import Session

from app.core.security import hash_password
from app.db.session import engine
from app.models.admin import SuperAdminRole, SuperAdminUser
from app.models.business import Business


def _register(client, source):
    body = {"business_name": f"Boutique {uuid.uuid4().hex[:6]}", "owner_full_name": "Patron", "pin": "1234"}
    if source is not None:
        body["signup_source"] = source
    r = client.post("/auth/register-business", json=body)
    assert r.status_code == 200, r.text
    with Session(engine) as session:
        return session.get(Business, uuid.UUID(r.json()["business_id"])).signup_source


def test_signup_source_is_normalized_and_never_blocks_signup(client):
    assert _register(client, "TikTok") == "tiktok"
    assert _register(client, " whatsapp ") == "whatsapp"
    # Valeur douteuse venue d'une URL publique : ignorée, l'inscription passe quand même.
    assert _register(client, "<script>alert(1)</script>") is None
    assert _register(client, None) is None


def test_admin_analytics_breaks_down_signups_by_channel(client):
    _register(client, "instagram")
    _register(client, "instagram")
    with Session(engine) as session:
        session.add(
            SuperAdminUser(
                email="acq@korise.app",
                full_name="Root",
                password_hash=hash_password("hunter2hunter"),
                role=SuperAdminRole.owner,
            )
        )
        session.commit()
    token = client.post("/admin/auth/login", json={"email": "acq@korise.app", "password": "hunter2hunter"}).json()["access_token"]
    r = client.get("/admin/analytics", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    rows = {row["source"]: row for row in r.json()["acquisition"]}
    assert rows["instagram"]["signups"] >= 2
    assert rows["instagram"]["activated"] == 0
    assert "direct" in rows
