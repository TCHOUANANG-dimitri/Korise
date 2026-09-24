import uuid
from datetime import date

from sqlmodel import Session

from app.db.session import engine
from app.models.catalog import Product


def _register_business(client, pin="1234"):
    r = client.post(
        "/auth/register-business",
        json={"business_name": "Credit Test", "owner_full_name": "Patron A", "pin": pin},
    )
    assert r.status_code == 200, r.text
    return r.json()


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_product(client, token, **overrides) -> dict:
    defaults = dict(name="Jus", quantity=10, selling_price=500, purchase_price=300, minimum_stock=0)
    defaults.update(overrides)
    r = client.post("/products", json=defaults, headers=_auth_header(token))
    assert r.status_code == 200, r.text
    return r.json()


def _create_customer(client, token, market_name="Maman Rose") -> dict:
    r = client.post(
        "/customers",
        json={"client_uuid": str(uuid.uuid4()), "full_name": market_name, "phone": "690000000"},
        headers=_auth_header(token),
    )
    assert r.status_code == 200, r.text
    return r.json()


def _push(client, token, **payload) -> dict:
    r = client.post("/sync/push", json=payload, headers=_auth_header(token))
    assert r.status_code == 200, r.text
    return r.json()


def test_credit_sale_requires_customer(client):
    business = _register_business(client)
    product = _create_product(client, business["access_token"])

    result = _push(
        client,
        business["access_token"],
        sales=[
            {
                "client_uuid": str(uuid.uuid4()),
                "product_id": product["id"],
                "quantity": 2,
                "unit_price": 500,
                "payment_method": "credit",
            }
        ],
    )
    assert result["sales"][0]["status"] == "rejected"


def test_credit_sale_moves_no_cash_and_adds_to_customer_balance(client):
    business = _register_business(client)
    product = _create_product(client, business["access_token"])
    customer = _create_customer(client, business["access_token"])
    today = date.today().isoformat()

    result = _push(
        client,
        business["access_token"],
        sales=[
            {
                "client_uuid": str(uuid.uuid4()),
                "product_id": product["id"],
                "customer_id": customer["id"],
                "quantity": 2,
                "unit_price": 500,
                "payment_method": "credit",
            }
        ],
    )
    assert result["sales"][0]["status"] == "accepted"

    # Aucun mouvement de caisse dérivé d'une vente à crédit.
    expected = client.get(
        f"/closing/expected-cash?closing_date={today}",
        headers=_auth_header(business["access_token"]),
    ).json()
    assert expected["expected_cash"] == 0
    assert expected["expected_momo"] == 0

    # Le stock est bien décompté (une vente reste une vente).
    products = client.get("/products", headers=_auth_header(business["access_token"])).json()
    assert products[0]["quantity"] == 8

    # Le client doit 1000 FCFA.
    detail = client.get(
        f"/customers/{customer['id']}", headers=_auth_header(business["access_token"])
    ).json()
    assert detail["balance"] == 1000
    assert any(t["kind"] == "sale" and t["amount"] == 1000 for t in detail["transactions"])


def test_credit_sale_can_reference_offline_client_uuid(client):
    business = _register_business(client)
    product = _create_product(client, business["access_token"])
    token = business["access_token"]
    customer_uuid = str(uuid.uuid4())

    # Client créé sur l'appareil (routé par /sync/push), on ne connaît que son client_uuid.
    result = _push(
        client,
        token,
        customers=[{"client_uuid": customer_uuid, "full_name": "Maman Sale", "phone": "690000001"}],
    )
    assert result["customers"][0]["status"] == "accepted"

    # Vente à crédit référençant le client par son client_uuid local : acceptée.
    result = _push(
        client,
        token,
        sales=[
            {
                "client_uuid": str(uuid.uuid4()),
                "product_id": product["id"],
                "customer_id": customer_uuid,
                "quantity": 1,
                "unit_price": 500,
                "payment_method": "credit",
            }
        ],
    )
    assert result["sales"][0]["status"] == "accepted"

    pulled = client.get("/sync/pull", headers=_auth_header(token)).json()
    assert len(pulled["customers"]) == 1
    server_customer = pulled["customers"][0]
    assert server_customer["client_uuid"] == customer_uuid

    # Détail par l'id serveur (connu après pull) : solde à jour.
    detail = client.get(
        f"/customers/{server_customer['id']}", headers=_auth_header(token)
    ).json()
    assert detail["balance"] == 500


def test_credit_repayment_partial_then_full_is_idempotent(client):
    business = _register_business(client)
    product = _create_product(client, business["access_token"])
    customer = _create_customer(client, business["access_token"])
    customer_id = customer["id"]
    token = business["access_token"]

    _push(
        client,
        token,
        sales=[
            {
                "client_uuid": str(uuid.uuid4()),
                "product_id": product["id"],
                "customer_id": customer_id,
                "quantity": 2,
                "unit_price": 500,
                "payment_method": "credit",
            }
        ],
    )

    repay_uuid = str(uuid.uuid4())
    result = _push(
        client,
        token,
        credit_repayments=[
            {"client_uuid": repay_uuid, "customer_id": customer_id, "amount": 400, "channel": "cash"}
        ],
    )
    assert result["credit_repayments"][0]["status"] == "accepted"
    assert client.get(f"/customers/{customer_id}", headers=_auth_header(token)).json()["balance"] == 600

    # Rejouer le même client_uuid = idempotence, pas de double remboursement.
    result = _push(
        client,
        token,
        credit_repayments=[
            {"client_uuid": repay_uuid, "customer_id": customer_id, "amount": 400, "channel": "cash"}
        ],
    )
    assert result["credit_repayments"][0]["status"] == "duplicate"
    assert client.get(f"/customers/{customer_id}", headers=_auth_header(token)).json()["balance"] == 600

    # Remboursement total → solde à zéro.
    _push(
        client,
        token,
        credit_repayments=[
            {
                "client_uuid": str(uuid.uuid4()),
                "customer_id": customer_id,
                "amount": 600,
                "channel": "mobile_money",
                "note": "bouclé",
            }
        ],
    )
    assert client.get(f"/customers/{customer_id}", headers=_auth_header(token)).json()["balance"] == 0


def test_closing_expected_cash_and_momo_are_split(client):
    business = _register_business(client)
    product = _create_product(client, business["access_token"])
    customer = _create_customer(client, business["access_token"])
    token = business["access_token"]
    today = date.today().isoformat()

    _push(
        client,
        token,
        sales=[
            {
                "client_uuid": str(uuid.uuid4()),
                "product_id": product["id"],
                "quantity": 2,
                "unit_price": 500,
                "payment_method": "cash",
            },
            {
                "client_uuid": str(uuid.uuid4()),
                "product_id": product["id"],
                "quantity": 1,
                "unit_price": 500,
                "payment_method": "mobile_money",
            },
        ],
        money_movements=[
            {"client_uuid": str(uuid.uuid4()), "type": "expense", "channel": "cash", "amount": -300},
            {"client_uuid": str(uuid.uuid4()), "type": "withdrawal", "channel": "mobile_money", "amount": -100},
        ],
        credit_repayments=[
            {"client_uuid": str(uuid.uuid4()), "customer_id": customer["id"], "amount": 50, "channel": "cash"}
        ],
    )

    r = client.get(f"/closing/expected-cash?closing_date={today}", headers=_auth_header(token))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["expected_cash"] == 750  # 1000 (cash) − 300 (dépense) + 50 (remboursement)
    assert data["expected_momo"] == 400  # 500 (momo) − 100 (retrait)


def test_employee_update_owner_only_and_role_is_immutable(client):
    business = _register_business(client)
    owner_token = business["access_token"]

    r = client.post(
        "/auth/employees",
        json={"full_name": "Employe B", "pin": "5678", "can_view_purchase_prices": False},
        headers=_auth_header(owner_token),
    )
    assert r.status_code == 200, r.text
    emp = r.json()
    emp_token = client.post(
        "/auth/login", json={"business_code": business["business_code"], "pin": "5678"}
    ).json()["access_token"]

    # Un employé ne peut pas modifier un compte.
    r = client.patch(
        f"/auth/employees/{business['user_id']}",
        json={"can_view_purchase_prices": True},
        headers=_auth_header(emp_token),
    )
    assert r.status_code == 403

    # Le propriétaire ne peut pas se modifier lui-même via l'édition employés.
    r = client.patch(
        f"/auth/employees/{business['user_id']}",
        json={"can_view_purchase_prices": True},
        headers=_auth_header(owner_token),
    )
    assert r.status_code == 403

    # Modifier les permissions : ok.
    r = client.patch(
        f"/auth/employees/{emp['id']}",
        json={"can_view_purchase_prices": True, "can_view_owner_dashboard": True},
        headers=_auth_header(owner_token),
    )
    assert r.status_code == 200, r.text
    updated = r.json()
    assert updated["can_view_purchase_prices"] is True
    assert updated["can_view_owner_dashboard"] is True

    # Même si le client essaie de passer "role": "owner", le rôle ne bouge pas.
    r = client.patch(
        f"/auth/employees/{emp['id']}",
        json={"role": "owner"},
        headers=_auth_header(owner_token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "employee"

    # Désactivation : l'employé ne peut plus se connecter.
    r = client.patch(
        f"/auth/employees/{emp['id']}",
        json={"is_active": False},
        headers=_auth_header(owner_token),
    )
    assert r.status_code == 200
    assert r.json()["is_active"] is False
    r = client.post("/auth/login", json={"business_code": business["business_code"], "pin": "5678"})
    assert r.status_code == 401


def test_token_exposes_business_name(client):
    business = _register_business(client)
    assert business["business_name"] == "Credit Test"