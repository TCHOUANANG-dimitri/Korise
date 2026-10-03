import uuid
from datetime import timedelta

from sqlmodel import Session, select

from app.db.session import engine
from app.models.business import Business
from app.models.events import Sale
from app.models.user import User
from app.services.account_service import utcnow


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _setup(client, owner_pin="1234", employee_pin="5678"):
    """Business + one employee who made one cash sale. Returns (owner, employee, employee_id)."""
    r = client.post(
        "/auth/register-business",
        json={"business_name": "Suppression Test", "owner_full_name": "Patron S", "pin": owner_pin},
    )
    assert r.status_code == 200, r.text
    owner = r.json()
    r = client.post("/auth/employees", json={"full_name": "Employe S", "pin": employee_pin}, headers=_auth(owner["access_token"]))
    assert r.status_code == 200, r.text
    employee_id = r.json()["id"]
    r = client.post(
        "/products",
        json={"name": "Savon", "quantity": 10, "purchase_price": 200, "selling_price": 300},
        headers=_auth(owner["access_token"]),
    )
    product_id = r.json()["id"]
    r = client.post("/auth/login", json={"business_code": owner["business_code"], "pin": employee_pin})
    employee = r.json()
    r = client.post(
        "/sync/push",
        json={"sales": [{"client_uuid": str(uuid.uuid4()), "product_id": product_id, "quantity": 2, "unit_price": 300, "payment_method": "cash"}]},
        headers=_auth(employee["access_token"]),
    )
    assert r.json()["sales"][0]["status"] == "accepted"
    return owner, employee, employee_id


def test_owner_deletes_employee_but_keeps_history(client):
    owner, employee, employee_id = _setup(client)

    # Un employé ne peut pas supprimer de compte.
    r = client.delete(f"/auth/employees/{employee_id}", headers=_auth(employee["access_token"]))
    assert r.status_code == 403

    r = client.delete(f"/auth/employees/{employee_id}", headers=_auth(owner["access_token"]))
    assert r.status_code == 204, r.text

    # Connexion fermée, token existant refusé, absent de la liste, jamais réactivable.
    r = client.post("/auth/login", json={"business_code": owner["business_code"], "pin": "5678"})
    assert r.status_code == 401
    r = client.get("/products", headers=_auth(employee["access_token"]))
    assert r.status_code == 401
    r = client.get("/auth/employees", headers=_auth(owner["access_token"]))
    assert employee_id not in [u["id"] for u in r.json()]
    r = client.patch(f"/auth/employees/{employee_id}", json={"is_active": True}, headers=_auth(owner["access_token"]))
    assert r.status_code == 404
    r = client.delete(f"/auth/employees/{employee_id}", headers=_auth(owner["access_token"]))
    assert r.status_code == 404

    # L'historique reste : la vente est toujours là, attribuée à l'employé.
    with Session(engine) as session:
        sales = session.exec(select(Sale).where(Sale.user_id == uuid.UUID(employee_id))).all()
        assert len(sales) == 1
        assert session.get(User, uuid.UUID(employee_id)).full_name == "Employe S"


def test_verify_pin(client):
    owner, _, _ = _setup(client)
    assert client.post("/auth/verify-pin", json={"pin": "0000"}, headers=_auth(owner["access_token"])).status_code == 403
    assert client.post("/auth/verify-pin", json={"pin": "1234"}, headers=_auth(owner["access_token"])).status_code == 204


def test_owner_schedules_then_cancels_business_deletion(client):
    owner, employee, _ = _setup(client)
    headers = _auth(owner["access_token"])

    assert client.post("/business/me/deletion", json={"pin": "9999"}, headers=headers).status_code == 403
    assert client.post("/business/me/deletion", json={"pin": "1234"}, headers=_auth(employee["access_token"])).status_code == 403

    r = client.post("/business/me/deletion", json={"pin": "1234", "export_first": True}, headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["deletion_scheduled_for"] is not None

    # Délai de grâce : les employés sont bloqués, le propriétaire entre toujours.
    r = client.post("/auth/login", json={"business_code": owner["business_code"], "pin": "5678"})
    assert r.status_code == 403
    assert client.get("/products", headers=_auth(employee["access_token"])).status_code == 403
    r = client.post("/auth/login", json={"business_code": owner["business_code"], "pin": "1234"})
    assert r.status_code == 200
    assert r.json()["deletion_scheduled_for"] is not None

    # Historique téléchargeable.
    r = client.get("/business/export.pdf", headers=headers)
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    r = client.get("/business/export.xlsx", headers=headers)
    assert r.status_code == 200 and r.content.startswith(b"PK")

    r = client.delete("/business/me/deletion", headers=headers)
    assert r.status_code == 200
    assert r.json()["deletion_scheduled_for"] is None
    r = client.post("/auth/login", json={"business_code": owner["business_code"], "pin": "5678"})
    assert r.status_code == 200


def test_business_is_erased_after_grace_period(client):
    owner, _, _ = _setup(client)
    r = client.post("/business/me/deletion", json={"pin": "1234"}, headers=_auth(owner["access_token"]))
    assert r.status_code == 200
    business_id = uuid.UUID(owner["business_id"])

    with Session(engine) as session:
        business = session.get(Business, business_id)
        business.deletion_scheduled_for = utcnow() - timedelta(minutes=1)
        session.add(business)
        session.commit()

    r = client.post("/auth/login", json={"business_code": owner["business_code"], "pin": "1234"})
    assert r.status_code == 401

    with Session(engine) as session:
        assert session.get(Business, business_id) is None
        assert session.exec(select(Sale).where(Sale.business_id == business_id)).all() == []
        assert session.exec(select(User).where(User.business_id == business_id)).all() == []
