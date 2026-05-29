"""Integration tests for PUT /api/archery/sessions/in-progress/{label}."""

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

_TARGET_1 = {"number": 1, "scores": {"Alice": [10, 8], "Bob": [5, 11]}}
_URL = f"/api/archery/sessions/in-progress/{_LABEL}"


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(archery_service.settings, "data_dir", tmp_path)
    monkeypatch.setattr(session_repo.settings, "data_dir", tmp_path)


def seed_in_progress(tmp_path: Path, extra: dict | None = None) -> None:
    data = {**_BASE, **(extra or {})}
    (tmp_path / f"_ip_{_LABEL}.json").write_text(json.dumps(data))


def test_update_happy_path(tmp_path: Path) -> None:
    seed_in_progress(tmp_path)
    body = {**_BASE, "targets": [_TARGET_1]}
    resp = client.put(_URL, json=body)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "in_progress"
    assert len(data["targets"]) == 1
    assert data["targets"][0]["number"] == 1


def test_update_persists_to_file(tmp_path: Path) -> None:
    seed_in_progress(tmp_path)
    body = {**_BASE, "targets": [_TARGET_1]}
    client.put(_URL, json=body)
    raw = json.loads((tmp_path / f"_ip_{_LABEL}.json").read_text())
    assert len(raw["targets"]) == 1
    assert raw["targets"][0]["scores"]["Alice"] == [10, 8]


def test_update_coerces_status_to_in_progress(tmp_path: Path) -> None:
    seed_in_progress(tmp_path)
    body = {**_BASE, "status": "finalised", "targets": [_TARGET_1]}
    resp = client.put(_URL, json=body)
    assert resp.status_code == 200
    assert resp.json()["status"] == "in_progress"


def test_update_no_tmp_artifact(tmp_path: Path) -> None:
    seed_in_progress(tmp_path)
    client.put(_URL, json={**_BASE, "targets": [_TARGET_1]})
    assert list(tmp_path.glob("*.tmp")) == []


def test_update_404_when_no_in_progress() -> None:
    resp = client.put(_URL, json={**_BASE, "targets": [_TARGET_1]})
    assert resp.status_code == 404
    assert "in-progress" in resp.json()["detail"].lower()


def test_update_400_when_path_label_mismatches_body(tmp_path: Path) -> None:
    seed_in_progress(tmp_path)
    body = {**_BASE, "label": "2026-05-30"}
    resp = client.put(_URL, json=body)
    assert resp.status_code == 400


def test_update_returns_all_targets(tmp_path: Path) -> None:
    seed_in_progress(tmp_path)
    target2 = {"number": 2, "scores": {"Alice": [8, 10], "Bob": [11, 5]}}
    body = {**_BASE, "targets": [_TARGET_1, target2]}
    resp = client.put(_URL, json=body)
    assert len(resp.json()["targets"]) == 2


def test_update_persists_partial_and_confirmed(tmp_path: Path) -> None:
    # Story 7.1: in-progress PUT accepts null shots, partial roster, confirmed flag.
    seed_in_progress(tmp_path)
    partial = {"number": 3, "scores": {"Alice": [None, 8]}, "confirmed": False}
    body = {**_BASE, "targets": [partial]}
    resp = client.put(_URL, json=body)
    assert resp.status_code == 200
    raw = json.loads((tmp_path / f"_ip_{_LABEL}.json").read_text())
    t = raw["targets"][0]
    assert t["scores"]["Alice"] == [None, 8]
    assert t["confirmed"] is False
