import uuid

from sqlmodel import Session, select

from app.db.session import engine
from app.models.user import User


def _identity(**overrides):
    suffix = uuid.uuid4().hex[:8]
    return {
        "business_name": f"Boutique Num {suffix}",
        "owner_full_name": f"Paul Num {suffix}",
        "owner_phone": "67" + str(uuid.uuid4().int)[:7],
        "pin": "1234",
        **overrides,
    }


def test_register_rejects_phone_with_letters(client):
    r = client.post("/auth/register-business", json=_identity(owner_phone="69abc0000"))
    assert r.status_code == 422


def test_register_rejects_pin_with_letters(client):
    r = client.post("/auth/register-business", json=_identity(pin="12ab"))
    assert r.status_code == 422


def test_register_normalizes_phone_separators(client):
    r = client.post("/auth/register-business", json=_identity(owner_phone="+237 6 90-11.22.33"))
    assert r.status_code == 200, r.text
    with Session(engine) as session:
        owner = session.get(User, uuid.UUID(r.json()["user_id"]))
        assert owner.phone == "+237690112233"


def test_create_employee_rejects_letters(client):
    r = client.post("/auth/register-business", json=_identity())
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    bad_phone = client.post("/auth/employees", headers=headers, json={"full_name": "E", "phone": "six", "pin": "5678"})
    bad_pin = client.post("/auth/employees", headers=headers, json={"full_name": "E", "pin": "56x8"})
    assert bad_phone.status_code == 422
    assert bad_pin.status_code == 422


def test_recover_code_matches_legacy_phone_with_spaces(client):
    identity = _identity()
    r = client.post("/auth/register-business", json=identity)
    with Session(engine) as session:
        owner = session.exec(select(User).where(User.id == uuid.UUID(r.json()["user_id"]))).one()
        digits = owner.phone
        owner.phone = f"{digits[:3]} {digits[3:6]} {digits[6:]}"  # compte créé avant la validation
        session.add(owner)
        session.commit()
    r2 = client.post(
        "/auth/recover-code",
        json={"business_name": identity["business_name"], "owner_full_name": identity["owner_full_name"], "owner_phone": digits},
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["business_code"] == r.json()["business_code"]
