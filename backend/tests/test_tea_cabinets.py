"""Resolving a user's cabinet, and migrating legacy per-user files into one."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.repositories import tea_repo as repo
from app.schemas.tea import Tea
from app.services import tea_cabinet_service as cabinets


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _write_legacy(tmp_path: Path, username: str = "alice") -> None:
    tea = Tea(
        id="t-abc12345",
        name="Da Hong Pao",
        catalogue_node_id="oolong",
        grams_remaining=38,
        created_at="2026-09-25T10:00:00+00:00",
        updated_at="2026-09-25T10:00:00+00:00",
    )
    raw = {"schema_version": 2, "teas": [tea.model_dump(mode="json")], "sessions": []}
    path = tmp_path / "tea" / "users" / f"{username}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(raw), encoding="utf-8")


def test_a_new_user_has_no_cabinet_and_reads_an_empty_one_they_own(tmp_path: Path) -> None:
    assert cabinets.resolve("alice") is None
    doc = cabinets.read_doc_for("alice")
    assert (doc.id, doc.owner, doc.teas) == ("", "alice", [])
    assert not (tmp_path / "tea" / "memberships.json").exists()


def test_ensure_creates_one_cabinet_and_is_idempotent() -> None:
    first = cabinets.ensure("alice")
    assert cabinets.ensure("alice") == first
    assert cabinets.resolve("alice") == first
    assert repo.read_memberships() == {"alice": first}
    assert repo.read_doc(first).owner == "alice"


def test_resolve_migrates_a_legacy_file(tmp_path: Path) -> None:
    _write_legacy(tmp_path)
    cabinet_id = cabinets.resolve("alice")
    assert cabinet_id is not None
    assert repo.read_memberships() == {"alice": cabinet_id}
    assert [t.id for t in cabinets.read_doc_for("alice").teas] == ["t-abc12345"]
    assert not repo.legacy_exists("alice")


def test_a_crash_before_the_map_write_is_redone_on_the_same_cabinet(tmp_path: Path) -> None:
    _write_legacy(tmp_path)
    interrupted = repo.adopt_legacy("alice", referenced=set())  # crashed before mapping
    assert cabinets.resolve("alice") == interrupted
    assert len(list((tmp_path / "tea" / "cabinets").glob("c_*.json"))) == 1


def test_a_leftover_legacy_file_is_deleted_once_mapped(tmp_path: Path) -> None:
    _write_legacy(tmp_path)
    cabinet_id = repo.adopt_legacy("alice", referenced=set())
    repo.write_memberships({"alice": cabinet_id})  # crashed before deleting the legacy file
    assert cabinets.resolve("alice") == cabinet_id
    assert not repo.legacy_exists("alice")


def test_ensure_on_a_legacy_user_migrates_rather_than_starting_empty(tmp_path: Path) -> None:
    _write_legacy(tmp_path)
    cabinet_id = cabinets.ensure("alice")
    assert [t.id for t in repo.read_doc(cabinet_id).teas] == ["t-abc12345"]


def test_a_cabinet_deleted_under_a_mapped_user_reads_as_gone() -> None:
    cabinet_id = cabinets.ensure("alice")
    repo.delete_cabinet(cabinet_id)
    with pytest.raises(cabinets.CabinetGoneError):
        cabinets.read_doc_for("alice")
