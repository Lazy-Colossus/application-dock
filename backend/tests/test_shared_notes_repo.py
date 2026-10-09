"""Repository tests for Shared Notes (Story 1.2).

The repo is the only filesystem code for notes; these tests pin the contract
the service layer builds on — none-on-missing, path safety, membership listing.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.config import settings
from app.repositories import shared_notes_repo as repo
from app.schemas.shared_notes import Note


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)


def _note(note_id: str = "n-abc12345", **overrides: object) -> Note:
    fields: dict[str, object] = {
        "id": note_id,
        "title": "Groceries",
        "body": "",
        "owner": "ana",
        "members": ["ana"],
        "rev": 0,
        "created_at": "2026-09-20T10:00:00.000Z",
        "updated_at": "2026-09-20T10:00:00.000Z",
    }
    fields.update(overrides)
    return Note.model_validate(fields)


# ── reads ─────────────────────────────────────────────────────────────────────


def test_read_note_returns_none_when_no_file_yet() -> None:
    assert repo.read_note("n-doesnotex") is None


def test_round_trip_preserves_multiline_body_and_members(tmp_path: Path) -> None:
    note = _note(
        body="line one\nline two\n\n  indented  ",
        members=["ana", "bo", "cy"],
    )
    repo.write_note(note)

    read_back = repo.read_note(note.id)
    assert read_back is not None
    assert read_back.model_dump() == note.model_dump()


def test_write_creates_the_notes_directory_on_first_write(tmp_path: Path) -> None:
    assert not (tmp_path / "shared-notes" / "notes").exists()
    repo.write_note(_note())
    assert (tmp_path / "shared-notes" / "notes" / "n-abc12345.json").is_file()


def test_write_leaves_no_temp_file_beside_the_note(tmp_path: Path) -> None:
    repo.write_note(_note())
    notes_dir = tmp_path / "shared-notes" / "notes"
    assert [p.name for p in notes_dir.iterdir()] == ["n-abc12345.json"]


# ── path safety (NFR-2) ───────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "unsafe",
    ["../secrets", "a/b", "a\\b", ".", "..", "", "   ", "n-abc.json", " n-abc"],
)
def test_unsafe_note_ids_are_rejected(unsafe: str) -> None:
    with pytest.raises(ValueError):
        repo.read_note(unsafe)
    with pytest.raises(ValueError):
        repo.delete_note(unsafe)


def test_traversal_cannot_write_outside_the_notes_directory(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        repo.write_note(_note("../escaped"))
    assert not (tmp_path / "shared-notes" / "escaped.json").exists()


# ── delete ────────────────────────────────────────────────────────────────────


def test_delete_removes_the_file() -> None:
    repo.write_note(_note())
    repo.delete_note("n-abc12345")
    assert repo.read_note("n-abc12345") is None


def test_delete_is_idempotent_for_a_missing_note() -> None:
    repo.delete_note("n-abc12345")


# ── listing by membership (AR-2) ──────────────────────────────────────────────


def test_list_notes_for_returns_only_notes_i_am_a_member_of() -> None:
    repo.write_note(_note("n-mine0001", owner="ana", members=["ana"]))
    repo.write_note(_note("n-shared01", owner="bo", members=["bo", "ana"]))
    repo.write_note(_note("n-theirs01", owner="bo", members=["bo"]))

    ids = {n.id for n in repo.list_notes_for("ana")}
    assert ids == {"n-mine0001", "n-shared01"}


def test_list_notes_for_is_empty_before_any_note_exists() -> None:
    assert repo.list_notes_for("ana") == []


def test_list_notes_for_ignores_non_json_files(tmp_path: Path) -> None:
    repo.write_note(_note())
    stray = tmp_path / "shared-notes" / "notes" / "README.txt"
    stray.write_text("not a note", encoding="utf-8")
    assert [n.id for n in repo.list_notes_for("ana")] == ["n-abc12345"]


# ── migration hook (AR-3) ─────────────────────────────────────────────────────


def test_migrate_leaves_a_current_note_alone() -> None:
    raw = {"schema_version": 1, "id": "n-abc12345", "updated_at": "2026-09-20T10:00:00.500Z"}
    assert repo.migrate(dict(raw)) == raw


def test_migrate_normalises_a_second_precision_stamp() -> None:
    migrated = repo.migrate(
        {"created_at": "2026-09-20T10:00:00Z", "updated_at": "2026-09-20T10:00:07Z"}
    )
    assert migrated == {
        "created_at": "2026-09-20T10:00:00.000Z",
        "updated_at": "2026-09-20T10:00:07.000Z",
    }


def test_a_legacy_stamp_no_longer_outranks_a_later_one() -> None:
    """`Z` sorts after `.`, so an un-normalised old stamp would look newer.

    "2026-09-20T10:00:00Z" > "2026-09-20T10:00:00.500Z" as raw strings — the
    note saved half a second later would have sorted below the older one.
    """
    legacy = repo.migrate({"updated_at": "2026-09-20T10:00:00Z"})["updated_at"]
    later = "2026-09-20T10:00:00.500Z"
    assert legacy < later


def test_migrate_ignores_a_stamp_it_does_not_recognise() -> None:
    raw = {"created_at": "not a date", "updated_at": None}
    assert repo.migrate(dict(raw)) == raw


def test_reading_a_legacy_note_normalises_its_stamps(tmp_path: Path) -> None:
    import json

    notes_dir = tmp_path / "shared-notes" / "notes"
    notes_dir.mkdir(parents=True)
    (notes_dir / "n-legacy01.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "id": "n-legacy01",
                "title": "Old",
                "body": "",
                "owner": "ana",
                "members": ["ana"],
                "rev": 0,
                "created_at": "2026-09-20T10:00:00Z",
                "updated_at": "2026-09-20T10:00:00Z",
            }
        ),
        encoding="utf-8",
    )

    note = repo.read_note("n-legacy01")
    assert note is not None
    assert note.updated_at == "2026-09-20T10:00:00.000Z"


def test_read_runs_migrate_before_validation(monkeypatch: pytest.MonkeyPatch) -> None:
    repo.write_note(_note(title="before"))
    monkeypatch.setattr(repo, "migrate", lambda raw: {**raw, "title": "after"})
    read_back = repo.read_note("n-abc12345")
    assert read_back is not None
    assert read_back.title == "after"
