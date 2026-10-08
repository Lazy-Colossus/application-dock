"""The caller's apartment and rev-checked writes (FP-1, FP-8, NFR-a)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.repositories import floor_planner_repo as repo
from app.services import auth_service
from app.services import floor_planner_service as service


@pytest.fixture(autouse=True)
def setup(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)
    for name in ("ana", "bo"):
        auth_service.create_user(name)


def test_a_newcomer_sees_an_unsaved_empty_apartment(tmp_path: Path) -> None:
    apt = service.get_apartment("ana")
    assert (apt.id, apt.is_owner, apt.members, apt.rev) == (None, True, ["ana"], 0)
    assert (apt.cols, apt.rows) == (50, 40)
    assert apt.surface == [".." * 50] * 40
    assert apt.feature == [".." * 50] * 40
    assert apt.locked is False
    assert [layout.name for layout in apt.layouts] == ["Layout A"]
    assert not (tmp_path / "floor-planner").exists()


def test_locking_creates_the_apartment_and_bumps_rev() -> None:
    apt = service.set_locked("ana", 0, True)
    assert (apt.rev, apt.locked) == (1, True)
    assert apt.id is not None
    assert service.get_apartment("ana").id == apt.id


def test_a_stale_write_is_refused_and_names_who_changed_it() -> None:
    service.add_member("ana", "bo")
    service.set_locked("ana", 0, True)
    with pytest.raises(service.StaleRevError, match="ana changed this"):
        service.set_locked("bo", 0, False)
    apt = service.get_apartment("bo")
    assert (apt.rev, apt.locked) == (1, True)


def test_unlock_after_lock() -> None:
    service.set_locked("ana", 0, True)
    apt = service.set_locked("ana", 1, False)
    assert (apt.rev, apt.locked) == (2, False)


def test_documents_without_plan_rev_still_load() -> None:
    apartment_id = service.ensure_apartment("ana")
    path = repo.settings.data_dir / "floor-planner" / "apartments" / f"{apartment_id}.json"
    raw = json.loads(path.read_text())
    raw.pop("plan_rev", None)
    raw.pop("plan_updated_by", None)
    raw["rev"] = 7
    path.write_text(json.dumps(raw))
    apt = service.set_locked("ana", 0, True)
    assert (apt.plan_rev, apt.rev, apt.locked) == (1, 8, True)
