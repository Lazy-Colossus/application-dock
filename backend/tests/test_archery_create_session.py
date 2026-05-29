"""Integration tests for POST /api/archery/sessions."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import archery_service

client = TestClient(app)


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(archery_service.settings, "data_dir", tmp_path)
    from app.repositories import session_repo

    monkeypatch.setattr(session_repo.settings, "data_dir", tmp_path)


def test_create_session_happy_path(tmp_path: Path) -> None:
    resp = client.post("/api/archery/sessions", json={"archers": ["Alice", "Bob"]})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "in_progress"
    assert data["archers"] == ["Alice", "Bob"]
    assert data["targets"] == []
    assert "2026" in data["label"]  # contains today's date year
    # _in_progress.json must exist on disk
    assert (tmp_path / "_in_progress.json").exists()


def test_create_session_label_format(tmp_path: Path) -> None:
    import re

    resp = client.post("/api/archery/sessions", json={"archers": ["X"]})
    label = resp.json()["label"]
    assert re.match(r"^\d{4}-\d{2}-\d{2}(-\d+)?$", label)


def test_create_session_empty_archers_422() -> None:
    resp = client.post("/api/archery/sessions", json={"archers": []})
    assert resp.status_code == 422


def test_create_session_duplicate_names_422() -> None:
    resp = client.post("/api/archery/sessions", json={"archers": ["Alice", "Alice"]})
    assert resp.status_code == 422


def test_create_session_empty_name_422() -> None:
    resp = client.post("/api/archery/sessions", json={"archers": [""]})
    assert resp.status_code == 422


def test_create_session_whitespace_only_422() -> None:
    resp = client.post("/api/archery/sessions", json={"archers": ["   "]})
    assert resp.status_code == 422


def test_create_session_conflict_409(tmp_path: Path) -> None:
    # First session
    resp1 = client.post("/api/archery/sessions", json={"archers": ["Alice"]})
    assert resp1.status_code == 200
    # Second attempt while in-progress exists
    resp2 = client.post("/api/archery/sessions", json={"archers": ["Bob"]})
    assert resp2.status_code == 409
    assert "in progress" in resp2.json()["detail"].lower()
