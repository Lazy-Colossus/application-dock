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
