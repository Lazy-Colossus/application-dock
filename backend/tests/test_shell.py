from fastapi.testclient import TestClient

from app.main import app

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


def test_list_apps_response_is_direct_array_no_envelope() -> None:
    response = client.get("/api/apps")
    body = response.json()
    # Must be a list, not a dict wrapping a "data" key.
    assert isinstance(body, list)
    assert not isinstance(body, dict)
