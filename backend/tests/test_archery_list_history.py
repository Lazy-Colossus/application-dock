"""Integration tests for GET /api/archery/sessions (history list)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories import session_repo
from app.services import archery_service

client = TestClient(app)

_FINALISED_BASE = {
    "created": "2026-05-29T10:00:00Z",
    "status": "finalised",
    "targets": [],
}


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(archery_service.settings, "data_dir", tmp_path)
    monkeypatch.setattr(session_repo.settings, "data_dir", tmp_path)


def seed_session(tmp_path: Path, label: str, archers: list[str], targets: list[dict] | None = None) -> None:
    data = {**_FINALISED_BASE, "label": label, "archers": archers, "targets": targets or []}
    (tmp_path / f"{label}.json").write_text(json.dumps(data))


def test_empty_data_dir_returns_empty_list() -> None:
    resp = client.get("/api/archery/sessions")
    assert resp.status_code == 200
    assert resp.json() == []


def test_returns_array_not_envelope(tmp_path: Path) -> None:
    seed_session(tmp_path, "2026-05-29", ["Alice"])
    data = client.get("/api/archery/sessions").json()
    assert isinstance(data, list)


def test_excludes_in_progress(tmp_path: Path) -> None:
    seed_session(tmp_path, "2026-05-28", ["Alice"])
    in_progress = {**_FINALISED_BASE, "label": "2026-05-29", "status": "in_progress", "archers": ["Bob"]}
    (tmp_path / "_in_progress.json").write_text(json.dumps(in_progress))
    resp = client.get("/api/archery/sessions")
    assert len(resp.json()) == 1
    assert resp.json()[0]["label"] == "2026-05-28"


def test_sorted_newest_first(tmp_path: Path) -> None:
    seed_session(tmp_path, "2026-05-27", ["Alice"])
    seed_session(tmp_path, "2026-05-29", ["Bob"])
    seed_session(tmp_path, "2026-05-28", ["Charlie"])
    labels = [s["label"] for s in client.get("/api/archery/sessions").json()]
    assert labels == ["2026-05-29", "2026-05-28", "2026-05-27"]


def test_summary_fields(tmp_path: Path) -> None:
    targets = [{"number": 1, "scores": {"Alice": [10, 8], "Bob": [5, 5]}}]
    seed_session(tmp_path, "2026-05-29", ["Alice", "Bob"], targets)
    data = client.get("/api/archery/sessions").json()
    s = data[0]
    assert s["label"] == "2026-05-29"
    assert s["archer_count"] == 2
    assert s["winner"] == "Alice"
    assert s["winning_score"] == 18  # 10 + 8


def test_winner_computed_from_all_targets(tmp_path: Path) -> None:
    targets = [
        {"number": i + 1, "scores": {"Alice": [10, 8], "Bob": [5, 11]}}
        for i in range(18)
    ]
    seed_session(tmp_path, "2026-05-29", ["Alice", "Bob"], targets)
    s = client.get("/api/archery/sessions").json()[0]
    # Alice: 18 * 18 = 324; Bob: 18 * 16 = 288
    assert s["winner"] == "Alice"
    assert s["winning_score"] == 324


def test_tiebreak_alphabetical(tmp_path: Path) -> None:
    targets = [{"number": 1, "scores": {"Charlie": [5, 5], "Alice": [5, 5], "Bob": [5, 5]}}]
    seed_session(tmp_path, "2026-05-29", ["Charlie", "Alice", "Bob"], targets)
    s = client.get("/api/archery/sessions").json()[0]
    assert s["winner"] == "Alice"


def test_tiebreak_case_insensitive(tmp_path: Path) -> None:
    targets = [{"number": 1, "scores": {"bob": [5, 5], "Alice": [5, 5]}}]
    seed_session(tmp_path, "2026-05-29", ["bob", "Alice"], targets)
    s = client.get("/api/archery/sessions").json()[0]
    assert s["winner"] == "Alice"


def test_session_with_no_targets_has_zero_winner_score(tmp_path: Path) -> None:
    seed_session(tmp_path, "2026-05-29", ["Alice", "Bob"])
    s = client.get("/api/archery/sessions").json()[0]
    assert s["winning_score"] == 0
