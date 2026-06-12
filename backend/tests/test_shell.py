from fastapi.testclient import TestClient

from app.main import app
from app.services import update_service

client = TestClient(app)


def test_list_apps_returns_array() -> None:
    response = client.get("/api/apps")
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert len(body) >= 1


def test_list_apps_includes_archery() -> None:
    response = client.get("/api/apps")
    archery = next((a for a in response.json() if a["id"] == "archery"), None)
    assert archery is not None
    assert archery["label"] == "Archery Score Counter"
    assert archery["icon"] == "sports_score"
    assert archery["route"] == "/archery"


def test_list_apps_response_is_direct_array_no_envelope() -> None:
    response = client.get("/api/apps")
    body = response.json()
    # Must be a list, not a dict wrapping a "data" key.
    assert isinstance(body, list)
    assert not isinstance(body, dict)


# --- /api/shell/update-status ---

def test_get_update_status_returns_available_false(monkeypatch) -> None:
    monkeypatch.setattr(update_service, "is_update_available", lambda: False)
    response = client.get("/api/shell/update-status")
    assert response.status_code == 200
    assert response.json() == {"available": False}


def test_get_update_status_returns_available_true(monkeypatch) -> None:
    monkeypatch.setattr(update_service, "is_update_available", lambda: True)
    response = client.get("/api/shell/update-status")
    assert response.status_code == 200
    assert response.json() == {"available": True}


# --- /api/shell/update ---

def test_post_update_returns_202_when_available(monkeypatch) -> None:
    monkeypatch.setattr(update_service, "trigger_update", lambda: None)
    response = client.post("/api/shell/update")
    assert response.status_code == 202
    assert response.json() == {"detail": "Update started"}


def test_post_update_returns_503_when_not_available(monkeypatch) -> None:
    def _raise() -> None:
        raise RuntimeError("Update not available")

    monkeypatch.setattr(update_service, "trigger_update", _raise)
    response = client.post("/api/shell/update")
    assert response.status_code == 503
    assert response.json()["detail"] == "Update not available"


def test_post_update_returns_502_on_docker_error(monkeypatch) -> None:
    def _raise() -> None:
        raise RuntimeError("Update launch failed: socket error")

    monkeypatch.setattr(update_service, "trigger_update", _raise)
    response = client.post("/api/shell/update")
    assert response.status_code == 502
    assert "Update launch failed" in response.json()["detail"]
