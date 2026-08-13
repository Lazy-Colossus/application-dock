"""Unit tests for the Context-Switch per-user repository (Story 1.2)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.repositories import context_switch_repo as repo
from app.schemas.context_switch import ContextSwitchDoc, Grid, Todo, TodoList, TodoUpdate


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _users_dir(tmp_path: Path) -> Path:
    return tmp_path / "context-switch" / "users"


# ── read_doc: empty for a new user ────────────────────────────────────────────


def test_read_doc_returns_empty_doc_when_file_absent() -> None:
    doc = repo.read_doc("alice")
    assert isinstance(doc, ContextSwitchDoc)
    assert doc.schema_version == 1
    assert doc.lists == []


def test_read_doc_does_not_create_a_file(tmp_path: Path) -> None:
    repo.read_doc("alice")
    assert not (_users_dir(tmp_path) / "alice.json").exists()


# ── write_doc / read_doc round-trip ───────────────────────────────────────────


def test_write_creates_file_at_expected_path(tmp_path: Path) -> None:
    repo.write_doc("alice", ContextSwitchDoc(schema_version=1, lists=[]))
    assert (_users_dir(tmp_path) / "alice.json").is_file()


def test_write_read_round_trip() -> None:
    doc = ContextSwitchDoc(
        schema_version=1,
        lists=[
            TodoList(
                id="l-abc12345",
                name="Sprint work",
                grid=Grid(columns=4, rows=3),
                created_at="2026-08-13T10:00:00Z",
                todos=[
                    Todo(
                        id="t-9f8e7d6c",
                        header="Wire up auth",
                        body="notes",
                        color="#ffcc00",
                        status="active",
                        order=0,
                        created_at="2026-08-13T10:00:00Z",
                        updated_at="2026-08-13T10:00:00Z",
                        archived_at=None,
                        updates=[
                            TodoUpdate(
                                id="u-11112222",
                                text="blocked on key",
                                created_at="2026-08-13T11:00:00Z",
                            )
                        ],
                    )
                ],
            )
        ],
    )
    repo.write_doc("alice", doc)
    back = repo.read_doc("alice")

    assert len(back.lists) == 1
    lst = back.lists[0]
    assert lst.name == "Sprint work"
    assert lst.grid.columns == 4 and lst.grid.rows == 3
    assert len(lst.todos) == 1
    todo = lst.todos[0]
    assert todo.header == "Wire up auth"
    assert todo.color == "#ffcc00"
    assert todo.status == "active"
    assert todo.updates[0].text == "blocked on key"


def test_write_is_isolated_per_user() -> None:
    repo.write_doc(
        "alice",
        ContextSwitchDoc(lists=[TodoList(id="l-a", name="A", created_at="2026-08-13T10:00:00Z")]),
    )
    repo.write_doc("bob", ContextSwitchDoc(lists=[]))

    assert len(repo.read_doc("alice").lists) == 1
    assert repo.read_doc("bob").lists == []


# ── migrate() on read ─────────────────────────────────────────────────────────


def test_read_doc_reads_a_v1_doc_unchanged(tmp_path: Path) -> None:
    raw = {"schema_version": 1, "lists": []}
    path = _users_dir(tmp_path) / "alice.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps(raw))

    doc = repo.read_doc("alice")
    assert doc.schema_version == 1


# ── unsafe usernames must never escape users/ ─────────────────────────────────


@pytest.mark.parametrize("bad", ["../evil", "a/b", "a\\b", "..", "", "  "])
def test_unsafe_username_rejected_on_read(bad: str) -> None:
    with pytest.raises(ValueError):
        repo.read_doc(bad)


@pytest.mark.parametrize("bad", ["../evil", "a/b", "a\\b", ".."])
def test_unsafe_username_rejected_on_write(bad: str) -> None:
    with pytest.raises(ValueError):
        repo.write_doc(bad, ContextSwitchDoc(lists=[]))
