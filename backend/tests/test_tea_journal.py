"""Cha Xi Journal: session schema rules, journal-only entries, photos, edits, deletes, listing."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.repositories import tea_repo as repo
from app.schemas.tea import TeaWriteRequest
from app.schemas.tea_session import ChaXi, TeaSessionWrite
from app.services import tea_curve_service as curves
from app.services import tea_service
from app.services import tea_session_service as sessions
from tests.tea_support import cabinet_of, share

JPEG = b"\xff\xd8\xff-jpeg-bytes"


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _write(**overrides: object) -> TeaSessionWrite:
    """A live timed snapshot."""
    payload: dict[str, object] = {
        "tea_id": "t-1",
        "status": "in_progress",
        "started_at": "2026-09-26T18:00:00+00:00",
        "curve_source": "generic",
        "curve_source_label": "generic gongfu",
        "infusions": [
            {"number": 1, "target_seconds": 10, "actual_seconds": 11},
            {"number": 2, "target_seconds": 15, "actual_seconds": None},
        ],
    }
    payload.update(overrides)
    return TeaSessionWrite.model_validate(payload)


def _entry(**overrides: object) -> TeaSessionWrite:
    """A journal-only entry: finished, untimed, no infusions."""
    payload: dict[str, object] = {
        "tea_id": "t-1",
        "status": "finalised",
        "started_at": "2026-09-20T12:00:00+00:00",
        "curve_source": "generic",
        "timed": False,
        "infusions": [],
    }
    payload.update(overrides)
    return TeaSessionWrite.model_validate(payload)


def test_moods_are_kept_once_each_in_vocabulary_order() -> None:
    assert ChaXi(moods=["social", "calm"]).moods == ["calm", "social"]


@pytest.mark.parametrize("moods", [["calm", "calm"], ["grumpy"]])
def test_a_repeated_or_unknown_mood_is_refused(moods: list[str]) -> None:
    with pytest.raises(ValidationError):
        ChaXi.model_validate({"moods": moods})


def test_a_snapshot_carries_its_cha_xi() -> None:
    snapshot = _write(cha_xi={"moods": ["calm"], "guests": "Eva", "notes": "honey"})
    assert snapshot.cha_xi is not None
    assert snapshot.cha_xi.guests == "Eva"
    assert snapshot.timed is True


def test_a_journal_only_entry_may_name_an_away_tea() -> None:
    entry = _entry(tea_id=None, away_tea_name="Teahouse Dancong", away_class_id="oolong")
    assert entry.tea_id is None
    assert entry.away_class_id == "oolong"


@pytest.mark.parametrize(
    "overrides",
    [
        {"tea_id": None},
        {"away_tea_name": "Dancong"},
        {"away_class_id": "oolong"},
        {"status": "in_progress"},
        {"infusions": [{"number": 1, "target_seconds": 10, "actual_seconds": 10}]},
    ],
)
def test_an_invalid_journal_only_entry_is_refused(overrides: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        _entry(**overrides)


def test_an_away_tea_cannot_be_timed() -> None:
    with pytest.raises(ValidationError):
        _write(tea_id=None, away_tea_name="Dancong")


def test_a_v4_cabinet_upgrades_to_v5() -> None:
    raw: dict[str, object] = {
        "schema_version": 4,
        "id": "c-1",
        "owner": "alice",
        "teas": [],
        "catalogue_nodes": [],
        "sessions": [],
        "teaware": [],
    }
    assert repo.migrate(raw)["schema_version"] == 5


def _tea(grams: float = 40, purchased: float | None = None, name: str = "Tieguanyin") -> str:
    req = TeaWriteRequest.model_validate(
        {
            "name": name,
            "catalogue_node_id": "oolong.anxi.tieguanyin",
            "grams_remaining": grams,
            "grams_purchased": purchased,
        }
    )
    return tea_service.create_tea("alice", req).id


def _grams(tea_id: str) -> float:
    return tea_service.get_tea("alice", tea_id).grams_remaining


def test_a_journal_only_entry_for_a_cabinet_tea_takes_its_grams() -> None:
    tea_id = _tea(40)
    saved = sessions.upsert("alice", "s-1", _entry(tea_id=tea_id, leaf_grams=5))
    assert saved.status == "finalised"
    assert saved.timed is False
    assert saved.finished_at is not None
    assert _grams(tea_id) == 35


def test_a_journal_only_entry_without_grams_leaves_the_tea_alone() -> None:
    tea_id = _tea(40)
    sessions.upsert("alice", "s-1", _entry(tea_id=tea_id))
    assert _grams(tea_id) == 40


def test_an_away_entry_touches_no_tea() -> None:
    tea_id = _tea(40)
    saved = sessions.upsert(
        "alice", "s-1", _entry(tea_id=None, away_tea_name="Teahouse Dancong", leaf_grams=5)
    )
    assert saved.tea_id is None
    assert saved.away_tea_name == "Teahouse Dancong"
    assert _grams(tea_id) == 40


def test_a_journal_only_entry_for_an_unknown_tea_is_not_found() -> None:
    with pytest.raises(FileNotFoundError):
        sessions.upsert("alice", "s-1", _entry(tea_id="t-missing"))


def test_a_snapshot_after_a_photo_keeps_the_photo() -> None:
    tea_id = _tea()
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id))
    sessions.save_image("alice", "s-1", JPEG, "image/jpeg")
    again = sessions.upsert("alice", "s-1", _write(tea_id=tea_id, cha_xi={"notes": "orchid"}))
    assert again.image_url == "/api/tea/sessions/s-1/image"
    assert again.cha_xi is not None and again.cha_xi.notes == "orchid"


def test_only_the_brewer_changes_a_sessions_photo_but_members_see_it() -> None:
    tea_id = _tea()
    share("alice", "bob")
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id))
    sessions.save_image("alice", "s-1", JPEG, "image/jpeg")
    with pytest.raises(PermissionError):
        sessions.save_image("bob", "s-1", JPEG, "image/jpeg")
    with pytest.raises(PermissionError):
        sessions.delete_image("bob", "s-1")
    assert sessions.image_path("bob", "s-1").exists()


def test_a_photo_for_an_unknown_session_is_not_found() -> None:
    with pytest.raises(FileNotFoundError):
        sessions.save_image("alice", "s-missing", JPEG, "image/jpeg")


def test_deleting_a_photo_clears_it() -> None:
    tea_id = _tea()
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id))
    sessions.save_image("alice", "s-1", JPEG, "image/jpeg")
    cleared = sessions.delete_image("alice", "s-1")
    assert cleared.image_url is None
    with pytest.raises(FileNotFoundError):
        sessions.image_path("alice", "s-1")


def test_discarding_a_live_session_removes_its_photo() -> None:
    tea_id = _tea()
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id))
    sessions.save_image("alice", "s-1", JPEG, "image/jpeg")
    sessions.discard("alice", "s-1")
    assert repo.find_image(cabinet_of("alice"), "s-1") is None


def test_deleting_a_tea_removes_its_sessions_photos() -> None:
    tea_id = _tea()
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id))
    sessions.save_image("alice", "s-1", JPEG, "image/jpeg")
    tea_service.delete_tea("alice", tea_id)
    assert repo.find_image(cabinet_of("alice"), "s-1") is None


def test_a_rated_journal_only_entry_never_becomes_the_brewing_curve() -> None:
    tea_id = _tea()
    sessions.upsert("alice", "s-1", _entry(tea_id=tea_id, rating=5))
    assert curves.curve_for("alice", tea_id).source != "best_session"
