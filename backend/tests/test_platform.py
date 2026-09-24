import base64
import uuid
from datetime import datetime, timedelta

from sqlmodel import Session

from app.core.security import hash_password
from app.db.session import engine
from app.models.admin import SuperAdminRole, SuperAdminUser


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _register(client, name="Plat Test", pin="1234", headers=None):
    r = client.post(
        "/auth/register-business",
        json={"business_name": name, "owner_full_name": "Patron", "pin": pin},
        headers=headers or {},
    )
    assert r.status_code == 200, r.text
    return r.json()


def _product(client, token, **kw):
    body = dict(name="Jus", quantity=50, selling_price=500, purchase_price=300, minimum_stock=2)
    body.update(kw)
    r = client.post("/products", json=body, headers=_h(token))
    assert r.status_code == 200, r.text
    return r.json()


def _push(client, token, **payload):
    r = client.post("/sync/push", json=payload, headers=_h(token))
    assert r.status_code == 200, r.text
    return r.json()


def _admin(client, email, role=SuperAdminRole.owner, password="hunter2hunter"):
    with Session(engine) as s:
        s.add(SuperAdminUser(email=email, full_name=f"Admin {role.value}", password_hash=hash_password(password), role=role))
        s.commit()
    r = client.post("/admin/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


# ------------------------------------------------------------------ shifts


def test_shift_open_close_computes_expected_cash_and_gap(client):
    b = _register(client, "Shift Shop", "1111")
    p = _product(client, b["access_token"])
    opened = datetime.utcnow() - timedelta(minutes=5)
    shift_id = str(uuid.uuid4())

    r = _push(client, b["access_token"], shifts=[{"client_uuid": shift_id, "opened_at": opened.isoformat(), "opening_cash": 10000}])
    assert r["shifts"][0]["status"] == "accepted"

    _push(client, b["access_token"], sales=[{"client_uuid": str(uuid.uuid4()), "product_id": p["id"], "quantity": 2, "unit_price": 500, "payment_method": "cash"}])

    closed = datetime.utcnow() + timedelta(minutes=1)
    r = _push(
        client, b["access_token"],
        shifts=[{"client_uuid": shift_id, "opened_at": opened.isoformat(), "opening_cash": 10000, "closed_at": closed.isoformat(), "counted_cash": 10500}],
    )
    assert r["shifts"][0]["status"] == "accepted"

    shifts = client.get("/shifts", headers=_h(b["access_token"])).json()
    assert len(shifts) == 1
    s = shifts[0]
    assert s["expected_cash"] == 11000  # 10 000 fond + 1 000 vente cash
    assert s["difference"] == -500
    assert s["sales_total"] == 1000

    # replay is idempotent
    r = _push(client, b["access_token"], shifts=[{"client_uuid": shift_id, "opened_at": opened.isoformat(), "opening_cash": 10000}])
    assert r["shifts"][0]["status"] == "duplicate"

    # the gap becomes an anomaly with a probable cause and drill-down operations
    anomalies = client.get("/anomalies", headers=_h(b["access_token"])).json()
    gap = next(a for a in anomalies if a["kind"] == "shift_gap")
    assert gap["amount"] == -500 and gap["probable_cause"]
    ops = client.get(f"/anomalies/shift_gap/{gap['source_id']}/operations", headers=_h(b["access_token"])).json()
    assert len(ops) >= 1


# ------------------------------------------------------------------ telemetry + admin


def test_heartbeat_feeds_monitoring_and_alerts(client):
    b = _register(client, "Sync Shop", "2222", headers={"X-Device-Id": "dev-abcdef", "X-Platform": "android", "X-App-Version": "0.1.0"})
    r = client.post(
        "/telemetry/heartbeat",
        json={"device_key": "dev-abcdef", "platform": "android", "app_version": "0.1.0", "pending_ops": 147, "sync_ok": False, "sync_error": "timeout"},
        headers=_h(b["access_token"]),
    )
    assert r.status_code == 200, r.text
    client.post(
        "/telemetry/heartbeat",
        json={"device_key": "dev-old111", "platform": "android", "app_version": "0.0.9", "pending_ops": 0, "sync_ok": True, "pushed": 3},
        headers=_h(b["access_token"]),
    )

    token = _admin(client, "mon@korise.app")
    mon = client.get("/admin/monitoring", headers=_h(token)).json()
    assert mon["pending_ops_total"] >= 147
    assert mon["sync_errors_24h"] >= 1
    assert any(a["kind"] == "sync_blocked" and "147" in a["title"] for a in mon["alerts"])
    assert mon["outdated_devices"] >= 1

    devices = client.get(f"/admin/devices?business_id={b['business_id']}", headers=_h(token)).json()
    assert {d["platform"] for d in devices} == {"android"}
    assert any(d["obsolete"] for d in devices)

    detail = client.get(f"/admin/businesses/{b['business_id']}", headers=_h(token)).json()
    assert detail["device_count"] == 2 and detail["pending_ops"] == 147
    assert any(e["type"] == "business.registered" for e in detail["history"])


def test_admin_analytics_funnel_and_feature_usage(client):
    b = _register(client, "Funnel Shop", "3333")
    p = _product(client, b["access_token"])
    _push(client, b["access_token"], sales=[{"client_uuid": str(uuid.uuid4()), "product_id": p["id"], "quantity": 1, "unit_price": 500, "payment_method": "orange_money"}])
    token = _admin(client, "an@korise.app", SuperAdminRole.product_manager)

    a = client.get("/admin/analytics?days=30", headers=_h(token)).json()
    steps = {s["key"]: s for s in a["funnel"]}
    assert steps["signup"]["count"] >= 1 and steps["configured"]["count"] >= 1 and steps["first_sale"]["count"] >= 1
    usage = {u["key"]: u for u in a["feature_usage"]}
    assert usage["sales"]["businesses"] >= 1 and usage["orange_money"]["businesses"] >= 1
    assert usage["multi_shop"]["available"] is False
    assert a["mau"] >= 1


def test_admin_roles_enforce_least_privilege(client):
    support = _admin(client, "sup@korise.app", SuperAdminRole.support)
    dev = _admin(client, "dev@korise.app", SuperAdminRole.developer)
    assert client.get("/admin/analytics", headers=_h(support)).status_code == 403
    assert client.get("/admin/billing", headers=_h(support)).status_code == 403
    assert client.get("/admin/billing", headers=_h(dev)).status_code == 403
    assert client.get("/admin/monitoring", headers=_h(dev)).status_code == 200
    assert client.get("/admin/admins", headers=_h(dev)).status_code == 403
    ov = client.get("/admin/overview", headers=_h(support)).json()
    assert ov["mrr"] is None  # no financial access for support


def test_suspend_blocks_business_and_is_audited(client):
    b = _register(client, "Suspend Shop", "4444")
    code = b["business_code"]
    token = _admin(client, "own@korise.app")
    r = client.post(f"/admin/businesses/{b['business_id']}/suspend", json={"reason": "impayé"}, headers=_h(token))
    assert r.status_code == 200 and r.json()["is_suspended"] is True

    assert client.post("/auth/login", json={"business_code": code, "pin": "4444"}).status_code == 403
    assert client.get("/products", headers=_h(b["access_token"])).status_code == 403

    r = client.post(f"/admin/businesses/{b['business_id']}/reactivate", json={}, headers=_h(token))
    assert r.json()["is_suspended"] is False
    assert client.post("/auth/login", json={"business_code": code, "pin": "4444"}).status_code == 200

    audit = client.get("/admin/audit", headers=_h(token)).json()
    actions = [a["action"] for a in audit]
    assert "business.suspend" in actions and "business.reactivate" in actions


def test_subscription_change_notes_and_tickets(client):
    b = _register(client, "Support Shop", "5555")
    token = _admin(client, "bill@korise.app")
    plan = client.post("/admin/plans", json={"name": "Pro", "price": 5000, "period": "monthly"}, headers=_h(token)).json()
    r = client.post(f"/admin/businesses/{b['business_id']}/subscription", json={"plan_id": plan["id"], "status": "active"}, headers=_h(token))
    assert r.status_code == 200 and r.json()["plan_name"] == "Pro"
    billing = client.get("/admin/billing", headers=_h(token)).json()
    assert billing["mrr"] >= 5000

    note = client.post(f"/admin/businesses/{b['business_id']}/notes", json={"text": "Client rappelé"}, headers=_h(token))
    assert note.status_code == 200
    t = client.post("/admin/tickets", json={"business_id": b["business_id"], "subject": "Sync lente"}, headers=_h(token)).json()
    assert t["status"] == "open"
    t2 = client.patch(f"/admin/tickets/{t['id']}", json={"status": "resolved"}, headers=_h(token)).json()
    assert t2["status"] == "resolved"


# ------------------------------------------------------------------ business settings + PDFs


def test_business_settings_and_branded_pdfs(client):
    b = _register(client, "Pdf Shop", "6666")
    token = b["access_token"]
    png = base64.b64encode(
        bytes.fromhex(
            "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc0f01f0005000201a3d7f4a40000000049454e44ae426082"
        )
    ).decode()
    r = client.patch(
        "/business/me",
        json={"address": "Rue 1, Douala", "phone": "699000000", "logo_data": f"data:image/png;base64,{png}"},
        headers=_h(token),
    )
    assert r.status_code == 200 and r.json()["address"] == "Rue 1, Douala"

    p = _product(client, token)
    sale_uuid = str(uuid.uuid4())
    _push(client, token, sales=[{"client_uuid": sale_uuid, "product_id": p["id"], "quantity": 3, "unit_price": 500, "payment_method": "cash"}],
          money_movements=[{"client_uuid": str(uuid.uuid4()), "type": "expense", "channel": "cash", "amount": -700, "reason": "Sachets", "category": "Fournitures"}])

    for path in (f"/receipts/{sale_uuid}.pdf", f"/invoices/{sale_uuid}.pdf", f"/reports/daily.pdf?day={datetime.utcnow().date()}", "/reports/stock.pdf", "/reports/anomalies.pdf"):
        r = client.get(path, headers=_h(token))
        assert r.status_code == 200, (path, r.text)
        assert r.headers["content-type"] == "application/pdf"
        assert r.content.startswith(b"%PDF"), path

    today = datetime.utcnow().date().isoformat()
    s = client.get(f"/reports/summary?date_from={today}&date_to={today}", headers=_h(token)).json()
    assert s["sales_total"] == 1500
    assert s["expenses_total"] == 700
    assert s["expenses_by_category"][0]["key"] == "Fournitures"
    assert s["estimated_profit"] == 1500 - 900 - 700

    me = client.get("/auth/employees", headers=_h(token)).json()
    r = client.get(f"/reports/employee.pdf?user_id={me[0]['id']}", headers=_h(token))
    assert r.status_code == 200 and r.content.startswith(b"%PDF")


def test_service_product_never_touches_stock_and_barcode_is_stored(client):
    b = _register(client, "Service Shop", "7777")
    token = b["access_token"]
    goods = _product(client, token, name="Riz", quantity=10, barcode="6001234")
    service = _product(client, token, name="Coupe", quantity=0, is_stockable=False, category="Services")
    assert goods["barcode"] == "6001234" and service["is_stockable"] is False

    _push(client, token, sales=[
        {"client_uuid": str(uuid.uuid4()), "product_id": goods["id"], "quantity": 2, "unit_price": 500, "payment_method": "cash"},
        {"client_uuid": str(uuid.uuid4()), "product_id": service["id"], "quantity": 1, "unit_price": 1000, "payment_method": "cash"},
    ])
    products = {p["name"]: p for p in client.get("/products", headers=_h(token)).json()}
    assert products["Riz"]["quantity"] == 8
    assert products["Coupe"]["quantity"] == 0  # a service is never decremented


def test_basket_receipt_with_several_lines(client):
    b = _register(client, "Basket Shop", "8888")
    token = b["access_token"]
    p1 = _product(client, token, name="A")
    p2 = _product(client, token, name="B")
    u1, u2 = str(uuid.uuid4()), str(uuid.uuid4())
    _push(client, token, sales=[
        {"client_uuid": u1, "product_id": p1["id"], "quantity": 1, "unit_price": 500, "payment_method": "orange_money"},
        {"client_uuid": u2, "product_id": p2["id"], "quantity": 2, "unit_price": 500, "payment_method": "orange_money"},
    ])
    r = client.get(f"/receipts.pdf?refs={u1},{u2}", headers=_h(token))
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    r = client.get(f"/invoices.pdf?refs={u1},{u2}", headers=_h(token))
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    assert client.get(f"/receipts.pdf?refs={uuid.uuid4()}", headers=_h(token)).status_code == 404
