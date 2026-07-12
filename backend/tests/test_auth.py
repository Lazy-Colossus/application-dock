"""Integration + unit tests for JWT authentication (Story 1.5)."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories import auth_repo, session_repo
from app.services import archery_service, auth_service

client = TestClient(app)

_TEST_USERNAME = "testuser"
_TEST_PASSWORD = "s3cr3t!"


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings
    from app.repositories import auth_repo as _ar

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(_ar.settings, "data_dir", tmp_path)
    monkeypatch.setattr(archery_service.settings, "data_dir", tmp_path)
    monkeypatch.setattr(session_repo.settings, "data_dir", tmp_path)
    # Ensure a stable JWT secret for tests
    monkeypatch.setattr(settings, "jwt_secret_key", "test-secret-key-for-tests-only")


@pytest.fixture()
def auth_user(tmp_path: Path) -> None:
    """Seed _auth.json with the test credentials."""
    record = auth_repo.UserRecord(
        username=_TEST_USERNAME,
        password_hash=auth_service.hash_password(_TEST_PASSWORD),
    )
    auth_repo.write_user(record)


def _login_token() -> str:
    resp = client.post(
        "/api/auth/login", json={"username": _TEST_USERNAME, "password": _TEST_PASSWORD}
    )
    assert resp.status_code == 200
    return resp.json()["access_token"]


# ── /api/auth/login ───────────────────────────────────────────────────────────


def test_login_success(auth_user: None) -> None:
    resp = client.post(
        "/api/auth/login", json={"username": _TEST_USERNAME, "password": _TEST_PASSWORD}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert len(data["access_token"]) > 0


def test_login_wrong_password(auth_user: None) -> None:
    resp = client.post("/api/auth/login", json={"username": _TEST_USERNAME, "password": "wrong"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid credentials"


def test_login_unknown_user() -> None:
    # No _auth.json exists — verify_login returns False
    resp = client.post("/api/auth/login", json={"username": "nobody", "password": "x"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid credentials"


# ── /api/auth/me ─────────────────────────────────────────────────────────────


def test_me_endpoint(auth_user: None) -> None:
    token = _login_token()
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json() == {"username": _TEST_USERNAME}


def test_me_no_token() -> None:
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


# ── Protected routes ──────────────────────────────────────────────────────────


def test_protected_route_no_token() -> None:
    resp = client.get("/api/archery/sessions")
    assert resp.status_code == 401


def test_protected_route_valid_token(auth_user: None) -> None:
    token = _login_token()
    resp = client.get("/api/archery/sessions", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


def test_protected_route_invalid_token() -> None:
    resp = client.get("/api/archery/sessions", headers={"Authorization": "Bearer not.a.real.token"})
    assert resp.status_code == 401


def test_health_unprotected() -> None:
    resp = client.get("/api/health")
    assert resp.status_code == 200


# ── /api/auth/users ───────────────────────────────────────────────────────────


def test_list_users(auth_user: None) -> None:
    token = _login_token()
    resp = client.get("/api/auth/users", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "usernames" in data
    assert _TEST_USERNAME in data["usernames"]


def test_list_users_unauthenticated() -> None:
    resp = client.get("/api/auth/users")
    assert resp.status_code == 401


def test_create_user_success(auth_user: None) -> None:
    token = _login_token()
    resp = client.post(
        "/api/auth/users",
        json={"username": "newuser"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["username"] == "newuser"
    # New user must be able to log in with tmp123
    login_resp = client.post("/api/auth/login", json={"username": "newuser", "password": "tmp123"})
    assert login_resp.status_code == 200
    # Original user still works
    assert client.post(
        "/api/auth/login", json={"username": _TEST_USERNAME, "password": _TEST_PASSWORD}
    ).status_code == 200


def test_create_user_duplicate(auth_user: None) -> None:
    token = _login_token()
    resp = client.post(
        "/api/auth/users",
        json={"username": _TEST_USERNAME},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 409
    assert resp.json()["detail"] == "Username already exists"


def test_create_user_empty_username(auth_user: None) -> None:
    token = _login_token()
    resp = client.post(
        "/api/auth/users",
        json={"username": "   "},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400


def test_create_user_unauthenticated() -> None:
    resp = client.post("/api/auth/users", json={"username": "hacker"})
    assert resp.status_code == 401


# ── /api/auth/change-password ─────────────────────────────────────────────────


def test_change_password_success(auth_user: None) -> None:
    token = _login_token()
    resp = client.post(
        "/api/auth/change-password",
        json={"current_password": _TEST_PASSWORD, "new_password": "newpass99"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["detail"] == "Password changed"
    # Old password no longer works
    assert client.post(
        "/api/auth/login", json={"username": _TEST_USERNAME, "password": _TEST_PASSWORD}
    ).status_code == 401
    # New password works
    assert client.post(
        "/api/auth/login", json={"username": _TEST_USERNAME, "password": "newpass99"}
    ).status_code == 200


def test_change_password_wrong_current(auth_user: None) -> None:
    token = _login_token()
    resp = client.post(
        "/api/auth/change-password",
        json={"current_password": "wrongpassword", "new_password": "newpass99"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Current password is incorrect"


def test_change_password_unauthenticated() -> None:
    resp = client.post(
        "/api/auth/change-password",
        json={"current_password": "x", "new_password": "y"},
    )
    assert resp.status_code == 401
