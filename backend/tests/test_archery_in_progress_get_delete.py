"""Integration tests for GET and DELETE /api/archery/sessions/in-progress."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories import session_repo
from app.services import archery_service

client = TestClient(app)

_BASE = {
    "label": "2026-05-29",
    "created": "2026-05-29T10:00:00Z",
    "status": "in_progress",
    "archers": ["Alice", "Bob"],
    "targets": [],
}

_TARGET_1 = {"number": 1, "scores": {"Alice": [10, 8], "Bob": [5, 11]}}


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(archery_service.settings, "data_dir", tmp_path)
    monkeypatch.setattr(session_repo.settings, "data_dir", tmp_path)


def seed_in_progress(tmp_path: Path, extra: dict | None = None) -> None:
    data = {**_BASE, **(extra or {})}
    (tmp_path / "_in_progress.json").write_text(json.dumps(data))


# ── GET /api/archery/sessions/in-progress ──────────────────────────────────


def test_get_returns_session_when_present(tmp_path: Path) -> None:
    seed_in_progress(tmp_path, extra={"targets": [_TARGET_1]})
    resp = client.get("/api/archery/sessions/in-progress")
    assert resp.status_code == 200
    data = resp.json()
    assert data["label"] == "2026-05-29"
    assert data["status"] == "in_progress"
    assert data["archers"] == ["Alice", "Bob"]
    assert len(data["targets"]) == 1


def test_get_body_matches_seed(tmp_path: Path) -> None:
    seed_in_progress(tmp_path)
    resp = client.get("/api/archery/sessions/in-progress")
    assert resp.status_code == 200
    data = resp.json()
    assert data["targets"] == []


def test_get_404_when_no_file() -> None:
    resp = client.get("/api/archery/sessions/in-progress")
    assert resp.status_code == 404
    assert "in progress" in resp.json()["detail"].lower()


def test_get_no_envelope(tmp_path: Path) -> None:
    seed_in_progress(tmp_path)
    data = client.get("/api/archery/sessions/in-progress").json()
    assert "label" in data
    assert "data" not in data


# ── DELETE /api/archery/sessions/in-progress ───────────────────────────────


def test_delete_removes_file(tmp_path: Path) -> None:
    seed_in_progress(tmp_path)
    resp = client.delete("/api/archery/sessions/in-progress")
    assert resp.status_code == 204
    assert not (tmp_path / "_in_progress.json").exists()


def test_delete_returns_no_body(tmp_path: Path) -> None:
    seed_in_progress(tmp_path)
    resp = client.delete("/api/archery/sessions/in-progress")
    assert resp.status_code == 204
    assert resp.text == ""


def test_delete_idempotent_when_no_file() -> None:
    resp = client.delete("/api/archery/sessions/in-progress")
    assert resp.status_code == 204


def test_delete_twice_is_idempotent(tmp_path: Path) -> None:
    seed_in_progress(tmp_path)
    client.delete("/api/archery/sessions/in-progress")
    resp = client.delete("/api/archery/sessions/in-progress")
    assert resp.status_code == 204
