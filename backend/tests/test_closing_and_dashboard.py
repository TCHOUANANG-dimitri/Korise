import uuid
from datetime import date

from sqlmodel import Session

from app.db.session import engine
from app.models.catalog import Product


def _register_business(client, pin="1234"):
    r = client.post(
        "/auth/register-business",
        json={"business_name": "Cyber Test", "owner_full_name": "Patron A", "pin": pin},
    )
    assert r.status_code == 200, r.text
    return r.json()


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_product(business_id: str, **overrides) -> str:
    with Session(engine) as session:
        defaults = dict(name="Jus", quantity=10, selling_price=500, purchase_price=300, minimum_stock=0)
        defaults.update(overrides)
        product = Product(business_id=uuid.UUID(business_id), **defaults)
        session.add(product)
        session.commit()
        session.refresh(product)
        return str(product.id)


def test_expected_cash_matches_sales_minus_expenses(client):
    business = _register_business(client)
    product_id = _create_product(business["business_id"])
    today = date.today().isoformat()

    client.post(
        "/sync/push",
        json={
            "sales": [
                {
                    "client_uuid": str(uuid.uuid4()),
                    "product_id": product_id,
                    "quantity": 2,
                    "unit_price": 500,
                    "payment_method": "cash",
                }
            ],
            "money_movements": [
                {
                    "client_uuid": str(uuid.uuid4()),
                    "type": "expense",
                    "channel": "cash",
                    "amount": -300,
                    "reason": "sachets",
                }
            ],
        },
        headers=_auth_header(business["access_token"]),
    )

    r = client.get(
        f"/closing/expected-cash?closing_date={today}",
        headers=_auth_header(business["access_token"]),
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["sales_total"] == 1000
    assert data["expense_total"] == -300
    assert data["expected_cash"] == 700
    assert data["expected_momo"] == 0


def test_daily_closing_uses_server_computed_expected_cash_not_client_value(client):
    business = _register_business(client)
    product_id = _create_product(business["business_id"])
    today = date.today().isoformat()

    client.post(
        "/sync/push",
        json={
            "sales": [
                {
                    "client_uuid": str(uuid.uuid4()),
                    "product_id": product_id,
                    "quantity": 2,
                    "unit_price": 500,
                    "payment_method": "cash",
                }
            ]
        },
        headers=_auth_header(business["access_token"]),
    )

    r = client.post(
        "/sync/push",
        json={
            "daily_closings": [
                {"client_uuid": str(uuid.uuid4()), "closing_date": today, "actual_cash": 900, "actual_momo": 0, "actual_orange": 0}
            ]
        },
        headers=_auth_header(business["access_token"]),
    )
    assert r.json()["daily_closings"][0]["status"] == "accepted"

    pulled = client.get("/sync/pull", headers=_auth_header(business["access_token"])).json()
    closing = pulled["daily_closings"][0]
    assert closing["expected_cash"] == 1000
    assert closing["actual_cash"] == 900
    assert closing["difference"] == -100
    assert closing["expected_momo"] == 0
    assert closing["actual_momo"] == 0
    assert closing["difference_momo"] == 0


def test_dashboard_shows_totals_alerts_and_top_products(client):
    business = _register_business(client)
    low_stock_product = _create_product(business["business_id"], name="Jus", quantity=1, minimum_stock=5)
    today = date.today().isoformat()

    client.post(
        "/sync/push",
        json={
            "sales": [
                {
                    "client_uuid": str(uuid.uuid4()),
                    "product_id": low_stock_product,
                    "quantity": 1,
                    "unit_price": 500,
                    "payment_method": "cash",
                }
            ]
        },
        headers=_auth_header(business["access_token"]),
    )

    r = client.get(
        f"/dashboard/daily?day={today}",
        headers=_auth_header(business["access_token"]),
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["sales_total"] == 500
    assert data["expected_cash"] == 500
    assert any(a["product_id"] == low_stock_product for a in data["stock_alerts"])
    assert data["top_products"][0]["quantity_sold"] == 1
    assert data["employee_activity"][0]["sales_total"] == 500


def test_employee_without_dashboard_permission_is_forbidden(client):
    business = _register_business(client)
    client.post(
        "/auth/employees",
        json={"full_name": "Employe B", "pin": "5678", "can_view_owner_dashboard": False},
        headers=_auth_header(business["access_token"]),
    )
    employee = client.post(
        "/auth/login", json={"business_code": business["business_code"], "pin": "5678"}
    ).json()

    today = date.today().isoformat()
    r = client.get(f"/dashboard/daily?day={today}", headers=_auth_header(employee["access_token"]))
    assert r.status_code == 403
