import uuid
from datetime import date

from app.models.events import DailyClosing


def _register_business(client, pin="1234"):
    r = client.post(
        "/auth/register-business",
        json={"business_name": "Anomalies Test", "owner_full_name": "Patron A", "pin": pin},
    )
    assert r.status_code == 200, r.text
    return r.json()


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_product(client, token, **overrides) -> dict:
    defaults = dict(name="Jus", quantity=50, selling_price=500, purchase_price=300, minimum_stock=0)
    defaults.update(overrides)
    r = client.post("/products", json=defaults, headers=_auth_header(token))
    assert r.status_code == 200, r.text
    return r.json()


def _push(client, token, **payload) -> dict:
    r = client.post("/sync/push", json=payload, headers=_auth_header(token))
    assert r.status_code == 200, r.text
    return r.json()


def test_closing_gap_appears_and_can_be_resolved(client):
    business = _register_business(client)
    product = _create_product(client, business["access_token"])
    token = business["access_token"]
    today = date.today().isoformat()

    # Une vente cash crée 1000 FCFA attendus…
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
            }
        ],
    )
    # …et la clôture déclare 0 compté : écart.
    _push(
        client,
        token,
        daily_closings=[
            {
                "client_uuid": str(uuid.uuid4()),
                "closing_date": today,
                "actual_cash": 0,
                "actual_momo": 0,
                "actual_orange": 0,
                "note": "zéro en caisse",
            }
        ],
    )

    r = client.get("/anomalies", headers=_auth_header(token))
    assert r.status_code == 200, r.text
    anomalies = r.json()
    gaps = [a for a in anomalies if a["kind"] == "closing_gap"]
    assert len(gaps) == 1
    gap = gaps[0]
    assert gap["status"] == "open"
    assert gap["amount"] == -1000  # 0 compté − 1000 attendus

    # Résolution, puis l'anomalie repasse en "resolved".
    r = client.post(
        f"/anomalies/closing_gap/{gap['source_id']}/resolve",
        json={"note": "argent oublié au tiroir"},
        headers=_auth_header(token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "resolved"

    resolved = client.get("/anomalies", headers=_auth_header(token)).json()
    assert [a for a in resolved if a["kind"] == "closing_gap"][0]["status"] == "resolved"
    # only_open exclut l'anomalie résolue.
    open_only = client.get("/anomalies?only_open=true", headers=_auth_header(token)).json()
    assert all(a["status"] == "open" for a in open_only)


def test_stock_adjustment_without_reason_is_flagged(client):
    business = _register_business(client)
    product = _create_product(client, business["access_token"])
    token = business["access_token"]

    _push(
        client,
        token,
        stock_movements=[
            {
                "client_uuid": str(uuid.uuid4()),
                "product_id": product["id"],
                "type": "adjustment",
                "quantity_delta": -20,
            }
        ],
    )

    anomalies = client.get("/anomalies", headers=_auth_header(token)).json()
    flagged = [a for a in anomalies if a["kind"] == "stock_adjustment"]
    assert len(flagged) == 1
    assert flagged[0]["status"] == "open"
    assert flagged[0]["product_name"] == "Jus"
    assert flagged[0]["amount"] == -20


def test_price_deviation_vs_catalog_is_flagged(client):
    business = _register_business(client)
    product = _create_product(client, business["access_token"])
    token = business["access_token"]

    # Catalogue à 500, vendu à 2000 : écart relatif de 300 %.
    _push(
        client,
        token,
        sales=[
            {
                "client_uuid": str(uuid.uuid4()),
                "product_id": product["id"],
                "quantity": 1,
                "unit_price": 2000,
                "payment_method": "cash",
            }
        ],
    )

    anomalies = client.get("/anomalies", headers=_auth_header(token)).json()
    flagged = [a for a in anomalies if a["kind"] == "price_deviation"]
    assert len(flagged) == 1
    assert flagged[0]["status"] == "open"
    assert flagged[0]["amount"] == 1500


def test_small_price_difference_is_not_flagged(client):
    business = _register_business(client)
    product = _create_product(client, business["access_token"])
    token = business["access_token"]

    # Catalogue à 500, vendu à 550 : 10 % d'écart, sous le seuil des 50 %.
    _push(
        client,
        token,
        sales=[
            {
                "client_uuid": str(uuid.uuid4()),
                "product_id": product["id"],
                "quantity": 1,
                "unit_price": 550,
                "payment_method": "cash",
            }
        ],
    )

    anomalies = client.get("/anomalies", headers=_auth_header(token)).json()
    assert not [a for a in anomalies if a["kind"] == "price_deviation"]


def test_anomalies_are_owner_only(client):
    business = _register_business(client)
    token = business["access_token"]

    client.post(
        "/auth/employees",
        json={"full_name": "Employe B", "pin": "5678"},
        headers=_auth_header(token),
    )
    emp_token = client.post(
        "/auth/login", json={"business_code": business["business_code"], "pin": "5678"}
    ).json()["access_token"]

    r = client.get("/anomalies", headers=_auth_header(emp_token))
    assert r.status_code == 403