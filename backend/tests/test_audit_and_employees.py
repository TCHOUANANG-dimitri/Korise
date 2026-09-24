import uuid


def _register_business(client):
    r = client.post(
        "/auth/register-business",
        json={"business_name": "Journal Test", "owner_full_name": "Patron A", "pin": "1234"},
    )
    assert r.status_code == 200, r.text
    return r.json()


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_employee(client, token, pin="5678"):
    r = client.post(
        "/auth/employees",
        json={"full_name": "Employe B", "pin": pin},
        headers=_auth_header(token),
    )
    assert r.status_code == 200, r.text
    return r.json()


def _login_employee(client, business_code, pin="5678"):
    r = client.post("/auth/login", json={"business_code": business_code, "pin": pin})
    assert r.status_code == 200, r.text
    return r.json()


def _create_product(client, token):
    r = client.post(
        "/products",
        json={"name": "Riz 5kg", "quantity": 20, "purchase_price": 800, "selling_price": 1200, "minimum_stock": 3},
        headers=_auth_header(token),
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_owner_lists_employees_without_pin(client):
    business = _register_business(client)
    emp = _create_employee(client, business["access_token"])

    r = client.get("/auth/employees", headers=_auth_header(business["access_token"]))
    assert r.status_code == 200, r.text
    users = r.json()
    ids = [u["id"] for u in users]
    assert business["user_id"] in ids
    assert emp["id"] in ids
    for u in users:
        assert "pin_hash" not in u
        assert u["is_active"] is True


def test_employee_cannot_list_employees(client):
    business = _register_business(client)
    _create_employee(client, business["access_token"])
    emp_login = _login_employee(client, business["business_code"])

    r = client.get("/auth/employees", headers=_auth_header(emp_login["access_token"]))
    assert r.status_code == 403


def test_audit_log_is_strictly_owned_by_business(client):
    business_a = _register_business(client)
    business_b = _register_business(client)
    _create_product(client, business_a["access_token"])

    r = client.get("/audit-log", headers=_auth_header(business_b["access_token"]))
    assert r.status_code == 200, r.text
    entries = r.json()
    actions = {e["action"] for e in entries}
    assert "business.registered" in actions
    assert "product.created" not in actions
    assert all(e["user_id"] == business_b["user_id"] for e in entries)


def test_audit_log_lists_registered_and_product_created(client):
    business = _register_business(client)
    _create_product(client, business["access_token"])

    r = client.get("/audit-log", headers=_auth_header(business["access_token"]))
    assert r.status_code == 200, r.text
    entries = r.json()
    assert len(entries) >= 2
    # Tri desc : la plus récente d'abord
    assert entries[0]["created_at"] >= entries[-1]["created_at"]
    actions = {e["action"] for e in entries}
    assert "business.registered" in actions
    assert "product.created" in actions
    product_entry = next(e for e in entries if e["action"] == "product.created")
    assert product_entry["user_full_name"] == "Patron A"
    assert product_entry["entity_type"] == "product"
    assert uuid.UUID(product_entry["entity_id"])


def test_audit_log_action_filter_and_limit(client):
    business = _register_business(client)
    _create_employee(client, business["access_token"])

    r = client.get("/audit-log?action=employee.created", headers=_auth_header(business["access_token"]))
    assert r.status_code == 200, r.text
    filtered = r.json()
    assert all(e["action"] == "employee.created" for e in filtered)
    assert len(filtered) >= 1

    r = client.get("/audit-log?limit=1", headers=_auth_header(business["access_token"]))
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_employee_cannot_read_audit_log(client):
    business = _register_business(client)
    _create_employee(client, business["access_token"])
    emp_login = _login_employee(client, business["business_code"])

    r = client.get("/audit-log", headers=_auth_header(emp_login["access_token"]))
    assert r.status_code == 403


def test_sync_push_actions_are_audited(client):
    # CLAUDE.md : toute action sensible (mouvement d'argent, ajustement de
    # stock, vente, clôture) doit écrire dans le journal — qui, quoi, quand.
    business = _register_business(client)
    p = _create_product(client, business["access_token"])

    r = client.post(
        "/sync/push",
        json={
            "sales": [{"client_uuid": str(uuid.uuid4()), "product_id": p["id"], "quantity": 2, "unit_price": 1200, "payment_method": "cash"}],
            "money_movements": [{"client_uuid": str(uuid.uuid4()), "type": "expense", "channel": "cash", "amount": -1000}],
            "stock_movements": [{"client_uuid": str(uuid.uuid4()), "product_id": p["id"], "type": "restock", "quantity_delta": 5}],
            "daily_closings": [{"client_uuid": str(uuid.uuid4()), "closing_date": "2026-09-18", "actual_cash": 5000, "actual_momo": 0, "actual_orange": 0}],
        },
        headers=_auth_header(business["access_token"]),
    )
    assert r.status_code == 200, r.text
    assert all(res["status"] == "accepted" for res in r.json()["sales"])

    r = client.get("/audit-log", headers=_auth_header(business["access_token"]))
    assert r.status_code == 200
    actions = {e["action"] for e in r.json()}
    assert "sale.created" in actions
    assert "money_movement.created" in actions
    assert "stock_movement.created" in actions
    assert "daily_closing.created" in actions
    new_entries = [e for e in r.json() if e["user_full_name"] == "Patron A"]
    assert all(e["entity_id"] for e in new_entries)