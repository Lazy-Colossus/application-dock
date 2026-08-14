"""Unit tests for auth_repo multi-user support (Story 1.6)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.repositories import auth_repo


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth_repo.settings, "data_dir", tmp_path)


# ── read_users ────────────────────────────────────────────────────────────────


def test_read_users_returns_empty_when_file_absent() -> None:
    assert auth_repo.read_users() == []


def test_read_users_migrates_single_object_to_list(tmp_path: Path) -> None:
    old = {"username": "admin", "password_hash": "$2b$12$abc"}
    (tmp_path / "_auth.json").write_text(json.dumps(old))

    result = auth_repo.read_users()

    assert len(result) == 1
    assert result[0].username == "admin"
    assert result[0].password_hash == "$2b$12$abc"
    # File must now be rewritten as a JSON array
    reloaded = json.loads((tmp_path / "_auth.json").read_text())
    assert isinstance(reloaded, list)
    assert reloaded[0]["username"] == "admin"


def test_read_users_returns_list_format(tmp_path: Path) -> None:
    records = [
        {"username": "alice", "password_hash": "$2b$12$aaa"},
        {"username": "bob", "password_hash": "$2b$12$bbb"},
    ]
    (tmp_path / "_auth.json").write_text(json.dumps(records))

    result = auth_repo.read_users()

    assert len(result) == 2
    assert result[0].username == "alice"
    assert result[1].username == "bob"


# ── write_users / read_users round-trip ───────────────────────────────────────


def test_write_users_read_users_round_trip() -> None:
    records = [
        auth_repo.UserRecord(username="alice", password_hash="$2b$12$aaa"),
        auth_repo.UserRecord(username="bob", password_hash="$2b$12$bbb"),
        auth_repo.UserRecord(username="carol", password_hash="$2b$12$ccc"),
    ]
    auth_repo.write_users(records)
    result = auth_repo.read_users()

    assert len(result) == 3
    assert result[0].username == "alice"
    assert result[1].username == "bob"
    assert result[2].username == "carol"


# ── read_user(username) ───────────────────────────────────────────────────────


def test_read_user_returns_matching_record() -> None:
    auth_repo.write_users(
        [
            auth_repo.UserRecord(username="alice", password_hash="$2b$12$aaa"),
            auth_repo.UserRecord(username="bob", password_hash="$2b$12$bbb"),
        ]
    )

    record = auth_repo.read_user("bob")

    assert record is not None
    assert record.username == "bob"
    assert record.password_hash == "$2b$12$bbb"


def test_read_user_returns_none_for_unknown_username() -> None:
    auth_repo.write_users(
        [
            auth_repo.UserRecord(username="alice", password_hash="$2b$12$aaa"),
        ]
    )

    assert auth_repo.read_user("nobody") is None


def test_read_user_returns_none_when_file_absent() -> None:
    assert auth_repo.read_user("anyone") is None


# ── write_user (preserve-or-append semantics) ─────────────────────────────────


def test_write_user_replaces_existing_username() -> None:
    auth_repo.write_users(
        [
            auth_repo.UserRecord(username="alice", password_hash="$2b$12$old"),
            auth_repo.UserRecord(username="bob", password_hash="$2b$12$bbb"),
        ]
    )

    auth_repo.write_user(auth_repo.UserRecord(username="alice", password_hash="$2b$12$new"))

    result = auth_repo.read_users()
    assert len(result) == 2
    alice = next(r for r in result if r.username == "alice")
    assert alice.password_hash == "$2b$12$new"


def test_write_user_preserves_other_users() -> None:
    auth_repo.write_users(
        [
            auth_repo.UserRecord(username="alice", password_hash="$2b$12$aaa"),
            auth_repo.UserRecord(username="bob", password_hash="$2b$12$bbb"),
        ]
    )

    auth_repo.write_user(auth_repo.UserRecord(username="alice", password_hash="$2b$12$new"))

    result = auth_repo.read_users()
    bob = next(r for r in result if r.username == "bob")
    assert bob.password_hash == "$2b$12$bbb"


def test_write_user_appends_when_username_not_present() -> None:
    auth_repo.write_users(
        [
            auth_repo.UserRecord(username="alice", password_hash="$2b$12$aaa"),
        ]
    )

    auth_repo.write_user(auth_repo.UserRecord(username="carol", password_hash="$2b$12$ccc"))

    result = auth_repo.read_users()
    assert len(result) == 2
    assert any(r.username == "carol" for r in result)
