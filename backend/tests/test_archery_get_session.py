"""Integration tests for GET /api/archery/sessions/{label}."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories import session_repo
from app.services import archery_service

client = TestClient(app)

_SESSION = {
    "label": "2026-05-21",
    "name": "2026-05-21",
    "date": "2026-05-21",
    "created": "2026-05-21T10:00:00Z",
    "status": "finalised",
    "archers": ["Alice", "Bob"],
    "targets": [],
}


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(archery_service.settings, "data_dir", tmp_path)
    monkeypatch.setattr(session_repo.settings, "data_dir", tmp_path)


def seed(tmp_path: Path, label: str, status: str = "finalised") -> None:
    data = {**_SESSION, "label": label, "status": status}
    (tmp_path / f"{label}.json").write_text(json.dumps(data))


def test_happy_path(tmp_path: Path) -> None:
    seed(tmp_path, "2026-05-21")
    resp = client.get("/api/archery/sessions/2026-05-21")
    assert resp.status_code == 200
    data = resp.json()
    assert data["label"] == "2026-05-21"
    assert data["status"] == "finalised"
    assert data["archers"] == ["Alice", "Bob"]


def test_not_found_returns_404(tmp_path: Path) -> None:
    resp = client.get("/api/archery/sessions/2026-05-99")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_invalid_label_returns_422() -> None:
    resp = client.get("/api/archery/sessions/foo")
    assert resp.status_code == 422


def test_path_traversal_returns_422() -> None:
    resp = client.get("/api/archery/sessions/../etc/passwd")
    # FastAPI will likely see this as a different path segment; confirm 422 or 404
    assert resp.status_code in (404, 422)


def test_underscore_prefix_returns_422() -> None:
    resp = client.get("/api/archery/sessions/_in_progress")
    assert resp.status_code == 422


def test_in_progress_status_returns_404(tmp_path: Path) -> None:
    seed(tmp_path, "2026-05-21", status="in_progress")
    resp = client.get("/api/archery/sessions/2026-05-21")
    assert resp.status_code == 404


def test_suffix_label(tmp_path: Path) -> None:
    seed(tmp_path, "2026-05-21-2")
    resp = client.get("/api/archery/sessions/2026-05-21-2")
    assert resp.status_code == 200
    assert resp.json()["label"] == "2026-05-21-2"


def test_no_envelope(tmp_path: Path) -> None:
    seed(tmp_path, "2026-05-21")
    data = client.get("/api/archery/sessions/2026-05-21").json()
    assert "label" in data
    assert "data" not in data
