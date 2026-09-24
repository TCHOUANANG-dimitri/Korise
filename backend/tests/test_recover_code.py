import uuid

from sqlmodel import Session, select

from app.db.session import engine
from app.models.events import AuditLog

# La base de test est partagée pour toute la session pytest : chaque test doit
# enregistrer une identité (nom entreprise + propriétaire + téléphone) UNIQUE,
# sinon le service retourne légitimement la première entreprise homonyme.
_counter = {"n": 0}


def _unique() -> str:
    _counter["n"] += 1
    return uuid.uuid4().hex[:8] + str(_counter["n"])


def _register_business(client, pin="1234"):
    suffix = _unique()
    identity = {
        "business_name": f"Boutique Awa {suffix}",
        "owner_full_name": f"Awa Ngo {suffix}",
        "owner_phone": f"69{suffix}"[:12],
    }
    r = client.post(
        "/auth/register-business",
        json={**identity, "pin": pin},
    )
    assert r.status_code == 200, r.text
    return r.json(), identity


def test_recover_code_returns_code(client):
    business, identity = _register_business(client)
    r = client.post("/auth/recover-code", json=identity)
    assert r.status_code == 200, r.text
    assert r.json()["business_code"] == business["business_code"]
    assert r.json()["business_name"] == identity["business_name"]


def test_recover_code_rejects_wrong_identity(client):
    business, identity = _register_business(client)
    # Mauvais téléphone
    r = client.post(
        "/auth/recover-code",
        json={**identity, "owner_phone": "699999999"},
    )
    assert r.status_code == 404

    # Mauvais nom de propriétaire
    r = client.post(
        "/auth/recover-code",
        json={**identity, "owner_full_name": "Quelqu'un d'autre"},
    )
    assert r.status_code == 404

    # Mauvais nom d'entreprise
    r = client.post(
        "/auth/recover-code",
        json={"business_name": "Autre boutique", "owner_full_name": identity["owner_full_name"], "owner_phone": identity["owner_phone"]},
    )
    assert r.status_code == 404


def test_recover_code_message_does_not_leak_existence(client):
    _register_business(client)
    r = client.post(
        "/auth/recover-code",
        json={"business_name": "Nimporte", "owner_full_name": "X", "owner_phone": "000"},
    )
    assert r.status_code == 404
    assert "Aucune entreprise" in r.json()["detail"]


def test_recover_code_writes_audit_log(client):
    business, identity = _register_business(client)
    r = client.post("/auth/recover-code", json=identity)
    assert r.status_code == 200, r.text
    with Session(engine) as session:
        row = session.exec(
            select(AuditLog).where(
                AuditLog.action == "business.code_recovered",
                AuditLog.business_id == uuid.UUID(business["business_id"]),
            )
        ).first()
        assert row is not None


def test_recovered_code_allows_login(client):
    business, identity = _register_business(client)
    r = client.post("/auth/recover-code", json=identity)
    code = r.json()["business_code"]
    r = client.post("/auth/login", json={"business_code": code, "pin": "1234"})
    assert r.status_code == 200
