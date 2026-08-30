"""Unit tests for the Listies per-user repository and schemas (Story 1.2)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.repositories import listies_repo as repo
from app.schemas.listies import Column, ListiesDoc, Row, Sheet, Tab


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _users_dir(tmp_path: Path) -> Path:
    return tmp_path / "listies" / "users"


def _doc() -> ListiesDoc:
    return ListiesDoc(
        schema_version=1,
        sheets=[
            Sheet(
                id="s-ab12cd34",
                name="Trip planning",
                created_at="2026-08-30T10:00:00Z",
                tabs=[
                    Tab(
                        id="tb-1f2e3d4c",
                        name="Packing",
                        order=0,
                        columns=[
                            Column(id="c-9a8b7c6d", name="Item", type="text", order=0),
                            Column(id="c-4d5e6f70", name="Qty", type="number", order=1),
                            Column(id="c-11223344", name="Due", type="date", order=2),
                        ],
                        rows=[
                            Row(
                                id="r-5e6f7a8b",
                                order=0,
                                cells={
                                    "c-9a8b7c6d": "Tent",
                                    "c-4d5e6f70": 1,
                                    "c-11223344": "2026-09-02",
                                },
                                created_at="2026-08-30T10:00:00Z",
                                updated_at="2026-08-30T10:00:00Z",
                            ),
                            Row(
                                id="r-1a2b3c4d",
                                order=1,
                                cells={"c-9a8b7c6d": "Stove"},
                                created_at="2026-08-30T10:01:00Z",
                                updated_at="2026-08-30T10:01:00Z",
                            ),
                        ],
                    )
                ],
            )
        ],
    )


# ── read_doc: empty for a new user ────────────────────────────────────────────


def test_read_doc_returns_empty_doc_when_file_absent() -> None:
    doc = repo.read_doc("alice")
    assert isinstance(doc, ListiesDoc)
    assert doc.schema_version == 1
    assert doc.sheets == []


def test_read_doc_does_not_create_a_file(tmp_path: Path) -> None:
    repo.read_doc("alice")
    assert not (_users_dir(tmp_path) / "alice.json").exists()


# ── write_doc / read_doc round-trip ───────────────────────────────────────────


def test_write_creates_file_at_expected_path(tmp_path: Path) -> None:
    repo.write_doc("alice", ListiesDoc())
    assert (_users_dir(tmp_path) / "alice.json").is_file()


def test_write_read_round_trip() -> None:
    repo.write_doc("alice", _doc())
    assert repo.read_doc("alice") == _doc()


def test_null_and_absent_cells_survive_a_round_trip() -> None:
    """An unentered cell is absent from `cells`; that must not become 0 or ""."""
    repo.write_doc("alice", _doc())
    row = repo.read_doc("alice").sheets[0].tabs[0].rows[1]
    assert row.cells == {"c-9a8b7c6d": "Stove"}
    assert row.cells.get("c-4d5e6f70") is None


def test_write_is_atomic_leaving_no_tmp_file(tmp_path: Path) -> None:
    repo.write_doc("alice", _doc())
    assert list(_users_dir(tmp_path).glob("*.tmp")) == []


def test_users_are_isolated_on_disk(tmp_path: Path) -> None:
    repo.write_doc("alice", _doc())
    assert repo.read_doc("bob").sheets == []
    assert (_users_dir(tmp_path) / "bob.json").exists() is False


def test_written_file_is_valid_json_with_schema_version(tmp_path: Path) -> None:
    repo.write_doc("alice", _doc())
    raw = json.loads((_users_dir(tmp_path) / "alice.json").read_text(encoding="utf-8"))
    assert raw["schema_version"] == 1
    assert raw["sheets"][0]["tabs"][0]["columns"][0]["type"] == "text"


# ── path safety ───────────────────────────────────────────────────────────────


@pytest.mark.parametrize("username", ["../escape", "a/b", "a\\b", "..", ".", "", "  "])
def test_unsafe_usernames_are_rejected(username: str) -> None:
    with pytest.raises(ValueError):
        repo.read_doc(username)
    with pytest.raises(ValueError):
        repo.write_doc(username, ListiesDoc())


# ── migrate ───────────────────────────────────────────────────────────────────


def test_migrate_is_a_passthrough_for_v1() -> None:
    raw = {"schema_version": 1, "sheets": []}
    assert repo.migrate(raw) == raw


def test_read_doc_runs_migrate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    path = _users_dir(tmp_path) / "alice.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"schema_version": 1, "sheets": []}), encoding="utf-8")
    monkeypatch.setattr(repo, "migrate", lambda raw: {"schema_version": 1, "sheets": []})
    assert repo.read_doc("alice").sheets == []


# ── schema strictness ─────────────────────────────────────────────────────────


def test_unknown_column_type_is_rejected() -> None:
    with pytest.raises(ValidationError):
        Column(id="c-1", name="Bad", type="colour", order=0)


def test_cells_accept_string_number_and_none() -> None:
    row = Row(
        id="r-1",
        order=0,
        cells={"c-a": "text", "c-b": 3, "c-c": 1.5, "c-d": None},
        created_at="x",
        updated_at="y",
    )
    assert row.cells["c-b"] == 3
    assert isinstance(row.cells["c-b"], int)
    assert row.cells["c-d"] is None
