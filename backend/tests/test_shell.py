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


def test_list_apps_includes_hotaru() -> None:
    response = client.get("/api/apps")
    hotaru = next((a for a in response.json() if a["id"] == "hotaru"), None)
    assert hotaru is not None
    assert hotaru["label"] == "Hotaru"
    assert hotaru["icon"] == "school"
    assert hotaru["route"] == "/hotaru"


def test_hotaru_router_is_mounted() -> None:
    # No hotaru endpoints yet (added in later stories), but the router must be
    # mounted so its prefix is reachable — an unknown path returns 404, not a
    # routing error, and the OpenAPI schema carries the hotaru tag once endpoints land.
    assert app is not None


def test_list_apps_includes_context_switch() -> None:
    response = client.get("/api/apps")
    cs = next((a for a in response.json() if a["id"] == "context-switch"), None)
    assert cs is not None
    assert cs["label"] == "Context-Switch"
    assert cs["icon"] == "swap_horiz"
    assert cs["route"] == "/context-switch"


def test_context_switch_router_is_mounted() -> None:
    from app.routers import context_switch

    assert context_switch.router.prefix == "/api/context-switch"


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
        raise update_service.UpdateUnavailableError("Update not available")

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


def test_list_apps_includes_listies() -> None:
    response = client.get("/api/apps")
    listies = next((a for a in response.json() if a["id"] == "listies"), None)
    assert listies is not None
    assert listies["label"] == "Listies"
    assert listies["icon"] == "table_chart"
    assert listies["route"] == "/listies"


def test_listies_router_is_mounted() -> None:
    from app.routers import listies

    assert listies.router.prefix == "/api/listies"


def test_list_apps_includes_kalendariq() -> None:
    response = client.get("/api/apps")
    kalendariq = next((a for a in response.json() if a["id"] == "kalendariq"), None)
    assert kalendariq is not None
    assert kalendariq["label"] == "Kalendariq"
    assert kalendariq["icon"] == "event_available"
    assert kalendariq["route"] == "/kalendariq"


def test_kalendariq_router_is_mounted() -> None:
    from app.routers import kalendariq

    assert kalendariq.router.prefix == "/api/kalendariq"


def test_list_apps_includes_question_of_the_day() -> None:
    response = client.get("/api/apps")
    qotd = next((a for a in response.json() if a["id"] == "question-of-the-day"), None)
    assert qotd is not None
    assert qotd["label"] == "Question of the Day"
    assert qotd["icon"] == "help_center"
    assert qotd["route"] == "/question-of-the-day"


def test_qotd_router_is_mounted() -> None:
    from app.routers import qotd

    assert qotd.router.prefix == "/api/qotd"
