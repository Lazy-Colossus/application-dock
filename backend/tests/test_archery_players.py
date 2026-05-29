"""Recurring players: repository, service, and API coverage (Story 8.2)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.repositories import session_repo
from app.services import archery_service

client = TestClient(app)


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(archery_service.settings, "data_dir", tmp_path)
    monkeypatch.setattr(session_repo.settings, "data_dir", tmp_path)


# ── repository ───────────────────────────────────────────────────────────────


def test_read_recurring_players_empty_when_absent() -> None:
    assert session_repo.read_recurring_players() == []


def test_recurring_players_round_trip(tmp_path: Path) -> None:
    session_repo.write_recurring_players(["Alice", "Bob"])
    assert (tmp_path / "_recurring_players.json").exists()
    assert session_repo.read_recurring_players() == ["Alice", "Bob"]
    # No .tmp leftover (atomic write).
    assert list(tmp_path.glob("*.tmp")) == []


def test_recurring_players_file_excluded_from_history(tmp_path: Path) -> None:
    session_repo.write_recurring_players(["Alice"])
    assert session_repo.list_sessions() == []


def test_read_recurring_players_tolerates_corrupt_file(tmp_path: Path) -> None:
    (tmp_path / "_recurring_players.json").write_text("{not json")
    assert session_repo.read_recurring_players() == []


# ── service ──────────────────────────────────────────────────────────────────


def test_add_player_new() -> None:
    assert archery_service.add_recurring_player("Alice") == ["Alice"]


def test_add_player_trims() -> None:
    assert archery_service.add_recurring_player("  Alice  ") == ["Alice"]


def test_add_player_duplicate_is_noop() -> None:
    archery_service.add_recurring_player("Alice")
    assert archery_service.add_recurring_player("Alice") == ["Alice"]


def test_add_player_empty_raises() -> None:
    with pytest.raises(ValueError):
        archery_service.add_recurring_player("   ")


def test_remove_player_present() -> None:
    archery_service.add_recurring_player("Alice")
    archery_service.add_recurring_player("Bob")
    assert archery_service.remove_recurring_player("Alice") == ["Bob"]


def test_remove_player_absent_is_idempotent() -> None:
    archery_service.add_recurring_player("Alice")
    assert archery_service.remove_recurring_player("Ghost") == ["Alice"]


# ── API ──────────────────────────────────────────────────────────────────────


def test_get_players_returns_array() -> None:
    resp = client.get("/api/archery/players")
    assert resp.status_code == 200
    assert resp.json() == []


def test_post_player_adds_and_returns_list() -> None:
    resp = client.post("/api/archery/players", json={"name": "Alice"})
    assert resp.status_code == 200
    assert resp.json() == ["Alice"]


def test_post_player_empty_422() -> None:
    resp = client.post("/api/archery/players", json={"name": "   "})
    assert resp.status_code == 422


def test_post_player_duplicate_noop_success() -> None:
    client.post("/api/archery/players", json={"name": "Alice"})
    resp = client.post("/api/archery/players", json={"name": "Alice"})
    assert resp.status_code == 200
    assert resp.json() == ["Alice"]


def test_delete_player_removes() -> None:
    client.post("/api/archery/players", json={"name": "Alice"})
    client.post("/api/archery/players", json={"name": "Bob"})
    resp = client.delete("/api/archery/players/Alice")
    assert resp.status_code == 200
    assert resp.json() == ["Bob"]


def test_delete_player_absent_idempotent() -> None:
    resp = client.delete("/api/archery/players/Ghost")
    assert resp.status_code == 200
    assert resp.json() == []


def test_players_persist_to_disk(tmp_path: Path) -> None:
    client.post("/api/archery/players", json={"name": "Alice"})
    raw = json.loads((tmp_path / "_recurring_players.json").read_text())
    assert raw == ["Alice"]
