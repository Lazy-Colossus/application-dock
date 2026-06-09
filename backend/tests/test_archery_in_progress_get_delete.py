"""Integration tests for the in-progress GET (list + by-label) and DELETE endpoints."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories import session_repo
from app.services import archery_service

client = TestClient(app)

_LABEL = "2026-05-29"
_BASE = {
    "label": _LABEL,
    "name": _LABEL,
    "date": _LABEL,
    "created": "2026-05-29T10:00:00Z",
    "status": "in_progress",
    "archers": ["Alice", "Bob"],
    "targets": [],
}

_TARGET_1 = {"number": 1, "scores": {"Alice": [10, 8], "Bob": [5, 11]}, "confirmed": True}


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(archery_service.settings, "data_dir", tmp_path)
    monkeypatch.setattr(session_repo.settings, "data_dir", tmp_path)


def seed_in_progress(tmp_path: Path, label: str = _LABEL, extra: dict | None = None) -> None:
    data = {**_BASE, "label": label, "name": label, "date": label[:10], **(extra or {})}
    (tmp_path / f"_ip_{label}.json").write_text(json.dumps(data))


# ── GET /api/archery/sessions/in-progress (list) ───────────────────────────


def test_list_empty_when_none() -> None:
    resp = client.get("/api/archery/sessions/in-progress")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_returns_summaries(tmp_path: Path) -> None:
    seed_in_progress(tmp_path, "2026-05-29", extra={"targets": [_TARGET_1]})
    seed_in_progress(tmp_path, "2026-05-29-2")
    data = client.get("/api/archery/sessions/in-progress").json()
    assert isinstance(data, list)
    assert {row["label"] for row in data} == {"2026-05-29", "2026-05-29-2"}
    by_label = {row["label"]: row for row in data}
    assert by_label["2026-05-29"]["confirmed_targets"] == 1
    assert by_label["2026-05-29"]["name"] == "2026-05-29"
    assert by_label["2026-05-29"]["date"] == "2026-05-29"


# ── GET /api/archery/sessions/in-progress/{label} ──────────────────────────


def test_get_by_label_when_present(tmp_path: Path) -> None:
    seed_in_progress(tmp_path, extra={"targets": [_TARGET_1]})
    resp = client.get(f"/api/archery/sessions/in-progress/{_LABEL}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["label"] == _LABEL
    assert data["status"] == "in_progress"
    assert len(data["targets"]) == 1


def test_get_by_label_404_when_absent() -> None:
    resp = client.get(f"/api/archery/sessions/in-progress/{_LABEL}")
    assert resp.status_code == 404
    assert "in-progress" in resp.json()["detail"].lower()


def test_get_by_label_no_envelope(tmp_path: Path) -> None:
    seed_in_progress(tmp_path)
    data = client.get(f"/api/archery/sessions/in-progress/{_LABEL}").json()
    assert "label" in data
    assert "data" not in data


# ── DELETE /api/archery/sessions/in-progress/{label} ───────────────────────


def test_delete_removes_only_that_file(tmp_path: Path) -> None:
    seed_in_progress(tmp_path, "2026-05-29")
    seed_in_progress(tmp_path, "2026-05-29-2")
    resp = client.delete("/api/archery/sessions/in-progress/2026-05-29")
    assert resp.status_code == 204
    assert not (tmp_path / "_ip_2026-05-29.json").exists()
    assert (tmp_path / "_ip_2026-05-29-2.json").exists()


def test_delete_returns_no_body(tmp_path: Path) -> None:
    seed_in_progress(tmp_path)
    resp = client.delete(f"/api/archery/sessions/in-progress/{_LABEL}")
    assert resp.status_code == 204
    assert resp.text == ""


def test_delete_idempotent_when_no_file() -> None:
    resp = client.delete(f"/api/archery/sessions/in-progress/{_LABEL}")
    assert resp.status_code == 204
