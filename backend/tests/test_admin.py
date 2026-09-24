from sqlmodel import Session

from app.core.security import hash_password
from app.db.session import engine
from app.models.admin import SuperAdminRole, SuperAdminUser


def _register_business(client, name="Cyber Test Admin", pin="1234"):
    r = client.post(
        "/auth/register-business",
        json={"business_name": name, "owner_full_name": "Patron A", "pin": pin},
    )
    assert r.status_code == 200, r.text
    return r.json()


def _create_super_admin(email="root@korise.app", password="hunter2hunter") -> None:
    with Session(engine) as session:
        session.add(
            SuperAdminUser(
                email=email,
                full_name="Root Admin",
                password_hash=hash_password(password),
                role=SuperAdminRole.owner,
            )
        )
        session.commit()


def test_admin_login_rejects_wrong_password(client):
    _create_super_admin(email="a1@korise.app")
    r = client.post("/admin/auth/login", json={"email": "a1@korise.app", "password": "wrong"})
    assert r.status_code == 401


def test_admin_login_succeeds_and_business_token_is_rejected(client):
    business = _register_business(client)
    _create_super_admin(email="a2@korise.app")

    r = client.post("/admin/auth/login", json={"email": "a2@korise.app", "password": "hunter2hunter"})
    assert r.status_code == 200, r.text
    admin_token = r.json()["access_token"]

    # Le token super admin marche sur une route admin.
    r = client.get("/admin/overview", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, r.text

    # Un token entreprise (business) ne doit jamais marcher sur une route admin, même valide.
    r = client.get(
        "/admin/overview", headers={"Authorization": f"Bearer {business['access_token']}"}
    )
    assert r.status_code == 401

    # Et inversement : un token admin ne doit jamais marcher sur une route entreprise.
    r = client.get("/products", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 401


def test_admin_sees_registered_business_in_list_and_detail(client):
    business = _register_business(client, name="Boutique Admin Test")
    _create_super_admin(email="a3@korise.app")
    token = client.post(
        "/admin/auth/login", json={"email": "a3@korise.app", "password": "hunter2hunter"}
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    r = client.get("/admin/businesses", headers=headers)
    assert r.status_code == 200, r.text
    rows = r.json()
    match = next(b for b in rows if b["id"] == business["business_id"])
    assert match["owner_full_name"] == "Patron A"
    assert match["plan_name"] == "Gratuit"
    assert match["subscription_status"] == "active"
    assert match["health"]["value"] == "healthy"

    r = client.get(f"/admin/businesses/{business['business_id']}", headers=headers)
    assert r.status_code == 200, r.text
    detail = r.json()
    assert detail["name"] == "Boutique Admin Test"
    assert detail["employee_count"] == 1
    assert detail["sales_count_30d"] == 0


def test_admin_overview_counts_total_businesses(client):
    _register_business(client, name="Boutique 1", pin="1111")
    _register_business(client, name="Boutique 2", pin="2222")
    _create_super_admin(email="a4@korise.app")
    token = client.post(
        "/admin/auth/login", json={"email": "a4@korise.app", "password": "hunter2hunter"}
    ).json()["access_token"]

    r = client.get("/admin/overview", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["businesses_total"] >= 2
    assert body["businesses_healthy"] >= 2
