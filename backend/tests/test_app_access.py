import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, settings
from app.core.dependencies import any_user, get_current_user
from app.main import app
from app.services.auth_service import create_access_token

client = TestClient(app)


@pytest.fixture
def as_peto() -> None:  # type: ignore[misc]
    app.dependency_overrides[get_current_user] = lambda: "peto"
    app.dependency_overrides[any_user] = lambda: "peto"
    yield


def test_the_default_limits_peto_and_patus_to_three_apps() -> None:
    three = frozenset({"archery", "iss-vanguard", "floor-planner"})
    assert settings.app_access_by_user == {"peto": three, "patus": three}


def test_access_parses_padding_and_skips_blanks() -> None:
    parsed = Settings(app_access=" ana : tea , listies ;; bo:").app_access_by_user
    assert parsed == {"ana": frozenset({"tea", "listies"}), "bo": frozenset()}


def test_a_limited_user_lists_only_their_apps(as_peto: None) -> None:
    ids = {a["id"] for a in client.get("/api/apps").json()}
    assert ids == {"archery", "iss-vanguard", "floor-planner"}


def test_a_limited_user_is_refused_other_apps(as_peto: None) -> None:
    assert client.get("/api/kitchencraft/recipes").status_code == 403
    assert client.get("/api/archery/sessions").status_code == 200


def test_everyone_else_lists_every_app() -> None:
    assert len(client.get("/api/apps").json()) == 12


def test_a_query_token_is_accepted_where_no_header_can_be_sent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "jwt_secret_key", "test-secret-key-for-tests-only")
    app.dependency_overrides.pop(any_user, None)
    token = create_access_token("peto")
    assert client.get(f"/api/tea/teas/x/image?token={token}").status_code == 403
    assert client.get("/api/tea/teas/x/image").status_code == 401
