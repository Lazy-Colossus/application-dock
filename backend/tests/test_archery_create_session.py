"""Integration tests for POST /api/archery/sessions."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories import session_repo
from app.services import archery_service

client = TestClient(app)


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(archery_service.settings, "data_dir", tmp_path)
    monkeypatch.setattr(session_repo.settings, "data_dir", tmp_path)


def _ip_files(tmp_path: Path) -> list[str]:
    return [p.name for p in tmp_path.glob("_ip_*.json")]


def test_create_session_happy_path(tmp_path: Path) -> None:
    resp = client.post("/api/archery/sessions", json={"archers": ["Alice", "Bob"]})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "in_progress"
    assert data["archers"] == ["Alice", "Bob"]
    assert data["targets"] == []
    assert "2026" in data["label"]  # contains today's date year
    # The session is persisted as its own _ip_{label}.json file.
    assert (tmp_path / f"_ip_{data['label']}.json").exists()


def test_create_session_label_format(tmp_path: Path) -> None:
    import re

    resp = client.post("/api/archery/sessions", json={"archers": ["X"]})
    label = resp.json()["label"]
    assert re.match(r"^\d{4}-\d{2}-\d{2}(-\d+)?$", label)


def test_create_session_defaults_name_to_label(tmp_path: Path) -> None:
    data = client.post("/api/archery/sessions", json={"archers": ["X"]}).json()
    assert data["name"] == data["label"]
    assert data["date"] == data["label"][:10]


def test_create_session_accepts_custom_name(tmp_path: Path) -> None:
    data = client.post(
        "/api/archery/sessions", json={"archers": ["X"], "name": "Club Champs"}
    ).json()
    assert data["name"] == "Club Champs"
    # date is still the calendar date, independent of the custom name
    assert data["date"] == data["label"][:10]


def test_create_session_blank_name_falls_back_to_label(tmp_path: Path) -> None:
    data = client.post("/api/archery/sessions", json={"archers": ["X"], "name": "   "}).json()
    assert data["name"] == data["label"]


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


def test_create_session_allows_multiple_concurrent(tmp_path: Path) -> None:
    # Story 6.1: a second session no longer conflicts — both stay in progress.
    resp1 = client.post("/api/archery/sessions", json={"archers": ["Alice"]})
    resp2 = client.post("/api/archery/sessions", json={"archers": ["Bob"]})
    assert resp1.status_code == 200
    assert resp2.status_code == 200
    label1, label2 = resp1.json()["label"], resp2.json()["label"]
    assert label1 != label2
    assert len(_ip_files(tmp_path)) == 2
