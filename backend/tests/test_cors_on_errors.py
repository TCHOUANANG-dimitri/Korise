"""Un 500 doit garder ses en-têtes CORS : sinon le navigateur le bloque et le client affiche
« Backend injoignable » au lieu de l'erreur réelle (incident du 2026-10-14)."""

from fastapi.testclient import TestClient

from app.main import app


def _boom():
    raise RuntimeError("panne simulée")


app.add_api_route("/__test/boom", _boom, methods=["GET"])


def test_unhandled_error_keeps_cors_headers():
    client = TestClient(app, raise_server_exceptions=False)
    res = client.get("/__test/boom", headers={"Origin": "https://biz-flow-theta.vercel.app"})

    assert res.status_code == 500
    assert res.json() == {"detail": "Erreur interne du serveur"}
    assert res.headers.get("access-control-allow-origin") == "https://biz-flow-theta.vercel.app"
