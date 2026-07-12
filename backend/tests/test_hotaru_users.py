from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_list_users_returns_dani_and_jake() -> None:
    response = client.get("/api/hotaru/users")
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    ids = [u["id"] for u in body]
    assert ids == ["dani", "jake"]
    names = {u["id"]: u["name"] for u in body}
    assert names == {"dani": "Dani", "jake": "Jake"}


def test_list_users_is_direct_array_no_envelope() -> None:
    body = client.get("/api/hotaru/users").json()
    assert isinstance(body, list)
    assert not isinstance(body, dict)
