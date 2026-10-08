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


def _apt(username: str) -> str:
    return service.list_apartments(username)[0].id


def test_a_newcomer_gets_an_empty_apartment_called_my_apartment() -> None:
    [summary] = service.list_apartments("ana")
    assert (summary.name, summary.is_owner, summary.members) == ("My apartment", True, ["ana"])
    apt = service.get_apartment("ana", summary.id)
    assert (apt.cols, apt.rows, apt.rev) == (50, 40, 0)
    assert apt.surface == [".." * 50] * 40
    assert apt.feature == [".." * 50] * 40
    assert apt.locked is False
    assert [layout.name for layout in apt.layouts] == ["Layout A"]
    assert service.list_apartments("ana") == [summary]


def test_locking_bumps_rev() -> None:
    apt = service.set_locked("ana", _apt("ana"), 0, True)
    assert (apt.rev, apt.locked) == (1, True)
    assert apt.updated_at is not None


def test_a_stale_write_is_refused_and_names_who_changed_it() -> None:
    service.add_member("ana", _apt("ana"), "bo")
    service.set_locked("ana", _apt("ana"), 0, True)
    with pytest.raises(service.StaleRevError, match="ana changed this"):
        service.set_locked("bo", _apt("bo"), 0, False)
    apt = service.get_apartment("bo", _apt("bo"))
    assert (apt.rev, apt.locked) == (1, True)


def test_unlock_after_lock() -> None:
    service.set_locked("ana", _apt("ana"), 0, True)
    apt = service.set_locked("ana", _apt("ana"), 1, False)
    assert (apt.rev, apt.locked) == (2, False)


def test_documents_without_plan_rev_still_load() -> None:
    apartment_id = _apt("ana")
    path = repo.settings.data_dir / "floor-planner" / "apartments" / f"{apartment_id}.json"
    raw = json.loads(path.read_text())
    raw.pop("plan_rev", None)
    raw.pop("plan_updated_by", None)
    raw["rev"] = 7
    path.write_text(json.dumps(raw))
    apt = service.set_locked("ana", _apt("ana"), 0, True)
    assert (apt.plan_rev, apt.rev, apt.locked) == (1, 8, True)
