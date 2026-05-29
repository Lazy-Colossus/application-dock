"""Integration tests for POST /api/archery/sessions/in-progress/{label}/finalise."""

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
_IN_PROGRESS = {
    "label": _LABEL,
    "name": _LABEL,
    "date": _LABEL,
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


def seed_in_progress(tmp_path: Path, label: str = _LABEL) -> None:
    data = {**_IN_PROGRESS, "label": label, "name": label, "date": label[:10]}
    (tmp_path / f"_ip_{label}.json").write_text(json.dumps(data))


def _finalise_url(label: str = _LABEL) -> str:
    return f"/api/archery/sessions/in-progress/{label}/finalise"


def test_finalise_happy_path(tmp_path: Path) -> None:
    seed_in_progress(tmp_path)
    resp = client.post(_finalise_url())
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "finalised"
    assert data["label"] == _LABEL
    assert (tmp_path / f"{_LABEL}.json").exists()
    assert not (tmp_path / f"_ip_{_LABEL}.json").exists()


def test_finalise_preserves_archers(tmp_path: Path) -> None:
    seed_in_progress(tmp_path)
    data = client.post(_finalise_url()).json()
    assert data["archers"] == ["Alice", "Bob"]


def test_finalise_zero_fills_all_targets(tmp_path: Path) -> None:
    # Story 7.1: an empty in-progress session finalises to 18 all-zero targets.
    seed_in_progress(tmp_path)
    data = client.post(_finalise_url()).json()
    assert len(data["targets"]) == 18
    assert [t["number"] for t in data["targets"]] == list(range(1, 19))
    for t in data["targets"]:
        assert t["scores"]["Alice"] == [0, 0]
        assert t["scores"]["Bob"] == [0, 0]


def test_finalise_zero_fills_partial_target(tmp_path: Path) -> None:
    # A partially-entered target keeps its entered shots; the rest become 0.
    label = "2026-05-29"
    data = {
        **_IN_PROGRESS,
        "targets": [{"number": 5, "scores": {"Alice": [11, None]}, "confirmed": False}],
    }
    (tmp_path / f"_ip_{label}.json").write_text(json.dumps(data))
    result = client.post(_finalise_url()).json()
    assert result["status"] == "finalised"
    t5 = next(t for t in result["targets"] if t["number"] == 5)
    assert t5["scores"]["Alice"] == [11, 0]
    assert t5["scores"]["Bob"] == [0, 0]


def test_finalise_only_touches_target_session(tmp_path: Path) -> None:
    seed_in_progress(tmp_path, "2026-05-29")
    seed_in_progress(tmp_path, "2026-05-29-2")
    client.post(_finalise_url("2026-05-29"))
    # The other in-progress session is untouched.
    assert (tmp_path / "_ip_2026-05-29-2.json").exists()
    assert not (tmp_path / "_ip_2026-05-29.json").exists()


def test_finalise_collision_uses_suffix(tmp_path: Path) -> None:
    (tmp_path / f"{_LABEL}.json").write_text(json.dumps({**_IN_PROGRESS, "status": "finalised"}))
    seed_in_progress(tmp_path)
    resp = client.post(_finalise_url())
    assert resp.status_code == 200
    data = resp.json()
    assert data["label"] == "2026-05-29-2"
    assert (tmp_path / "2026-05-29-2.json").exists()
    assert not (tmp_path / f"_ip_{_LABEL}.json").exists()


def test_finalise_double_collision(tmp_path: Path) -> None:
    (tmp_path / f"{_LABEL}.json").write_text(json.dumps({**_IN_PROGRESS, "status": "finalised"}))
    (tmp_path / "2026-05-29-2.json").write_text(
        json.dumps({**_IN_PROGRESS, "label": "2026-05-29-2", "status": "finalised"})
    )
    seed_in_progress(tmp_path)
    resp = client.post(_finalise_url())
    assert resp.status_code == 200
    assert resp.json()["label"] == "2026-05-29-3"
    assert (tmp_path / "2026-05-29-3.json").exists()


def test_finalise_404_when_no_in_progress() -> None:
    resp = client.post(_finalise_url())
    assert resp.status_code == 404
    assert "in-progress" in resp.json()["detail"].lower()


def test_finalise_no_tmp_artifact(tmp_path: Path) -> None:
    seed_in_progress(tmp_path)
    client.post(_finalise_url())
    tmp_files = list(tmp_path.glob("*.tmp"))
    assert tmp_files == [], f"Unexpected .tmp files: {tmp_files}"


def test_finalise_written_file_is_valid_json(tmp_path: Path) -> None:
    seed_in_progress(tmp_path)
    client.post(_finalise_url())
    raw = json.loads((tmp_path / f"{_LABEL}.json").read_text())
    assert raw["status"] == "finalised"
    assert isinstance(raw["archers"], list)
