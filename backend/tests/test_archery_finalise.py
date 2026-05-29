"""Integration tests for POST /api/archery/sessions/in-progress/finalise."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories import session_repo
from app.services import archery_service

client = TestClient(app)

_IN_PROGRESS = {
    "label": "2026-05-29",
    "created": "2026-05-29T10:00:00Z",
    "status": "in_progress",
    "archers": ["Alice", "Bob"],
    "targets": [],
}


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(archery_service.settings, "data_dir", tmp_path)
    monkeypatch.setattr(session_repo.settings, "data_dir", tmp_path)


def seed_in_progress(tmp_path: Path, label: str = "2026-05-29") -> None:
    data = {**_IN_PROGRESS, "label": label}
    (tmp_path / "_in_progress.json").write_text(json.dumps(data))


def test_finalise_happy_path(tmp_path: Path) -> None:
    seed_in_progress(tmp_path)
    resp = client.post("/api/archery/sessions/in-progress/finalise")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "finalised"
    assert data["label"] == "2026-05-29"
    assert (tmp_path / "2026-05-29.json").exists()
    assert not (tmp_path / "_in_progress.json").exists()


def test_finalise_preserves_archers_and_targets(tmp_path: Path) -> None:
    seed_in_progress(tmp_path)
    data = client.post("/api/archery/sessions/in-progress/finalise").json()
    assert data["archers"] == ["Alice", "Bob"]
    assert data["targets"] == []


def test_finalise_collision_uses_suffix(tmp_path: Path) -> None:
    # A finalised session with the same label already exists
    (tmp_path / "2026-05-29.json").write_text(json.dumps({**_IN_PROGRESS, "status": "finalised"}))
    seed_in_progress(tmp_path)
    resp = client.post("/api/archery/sessions/in-progress/finalise")
    assert resp.status_code == 200
    data = resp.json()
    assert data["label"] == "2026-05-29-2"
    assert (tmp_path / "2026-05-29-2.json").exists()
    assert not (tmp_path / "_in_progress.json").exists()


def test_finalise_double_collision(tmp_path: Path) -> None:
    (tmp_path / "2026-05-29.json").write_text(json.dumps({**_IN_PROGRESS, "status": "finalised"}))
    (tmp_path / "2026-05-29-2.json").write_text(json.dumps({**_IN_PROGRESS, "status": "finalised"}))
    seed_in_progress(tmp_path)
    resp = client.post("/api/archery/sessions/in-progress/finalise")
    assert resp.status_code == 200
    assert resp.json()["label"] == "2026-05-29-3"
    assert (tmp_path / "2026-05-29-3.json").exists()


def test_finalise_404_when_no_in_progress() -> None:
    resp = client.post("/api/archery/sessions/in-progress/finalise")
    assert resp.status_code == 404
    assert "in progress" in resp.json()["detail"].lower()


def test_finalise_no_tmp_artifact(tmp_path: Path) -> None:
    seed_in_progress(tmp_path)
    client.post("/api/archery/sessions/in-progress/finalise")
    tmp_files = list(tmp_path.glob("*.tmp"))
    assert tmp_files == [], f"Unexpected .tmp files: {tmp_files}"


def test_finalise_written_file_is_valid_json(tmp_path: Path) -> None:
    seed_in_progress(tmp_path)
    client.post("/api/archery/sessions/in-progress/finalise")
    raw = json.loads((tmp_path / "2026-05-29.json").read_text())
    assert raw["status"] == "finalised"
    assert isinstance(raw["archers"], list)
