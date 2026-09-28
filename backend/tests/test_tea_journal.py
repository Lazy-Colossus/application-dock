"""Cha Xi Journal: session schema rules, journal-only entries, photos, edits, deletes, listing."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.repositories import tea_repo as repo
from app.schemas.tea import TeaWriteRequest
from app.schemas.tea_session import ChaXi, JournalEdit, TeaSessionWrite
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


def _finished(tea_id: str, session_id: str = "s-1", grams: float | None = 5) -> None:
    sessions.upsert("alice", session_id, _write(tea_id=tea_id, leaf_grams=grams))
    sessions.upsert(
        "alice", session_id, _write(tea_id=tea_id, leaf_grams=grams, status="finalised")
    )


def _edit(**fields: object) -> JournalEdit:
    return JournalEdit.model_validate({"leaf_grams": 5, **fields})


def test_editing_only_the_notes_leaves_the_grams_exactly() -> None:
    tea_id = _tea(48, purchased=50)
    _finished(tea_id)
    assert _grams(tea_id) == 43
    sessions.edit_journal("alice", "s-1", _edit(cha_xi={"notes": "orchid, stone"}))
    assert _grams(tea_id) == 43


@pytest.mark.parametrize(("grams", "remaining"), [(7, 41), (3, 45), (None, 48)])
def test_changing_the_leaf_moves_the_grams_by_the_difference(
    grams: float | None, remaining: float
) -> None:
    tea_id = _tea(48, purchased=50)
    _finished(tea_id)
    sessions.edit_journal("alice", "s-1", _edit(leaf_grams=grams))
    assert _grams(tea_id) == remaining


def test_moving_a_journal_only_entry_to_another_tea_moves_its_grams() -> None:
    first = _tea(40, name="Tieguanyin")
    second = _tea(30, name="Rougui")
    sessions.upsert("alice", "s-1", _entry(tea_id=first, leaf_grams=5))
    sessions.edit_journal("alice", "s-1", _edit(tea_id=second))
    assert _grams(first) == 40
    assert _grams(second) == 25


def test_an_edit_saves_cha_xi_rating_and_date() -> None:
    tea_id = _tea()
    sessions.upsert("alice", "s-1", _entry(tea_id=tea_id))
    entry = sessions.edit_journal(
        "alice",
        "s-1",
        _edit(
            leaf_grams=None,
            rating=4,
            started_at="2026-09-18T12:00:00+00:00",
            tea_id=tea_id,
            cha_xi={"moods": ["cosy"], "guests": "Eva"},
        ),
    )
    assert entry.rating == 4
    assert entry.started_at == "2026-09-18T12:00:00+00:00"
    assert entry.cha_xi is not None and entry.cha_xi.moods == ["cosy"]
    assert entry.tea_name == "Tieguanyin"


def test_a_timed_session_cannot_change_its_tea_or_date() -> None:
    tea_id = _tea()
    _finished(tea_id)
    with pytest.raises(ValueError):
        sessions.edit_journal("alice", "s-1", _edit(started_at="2026-09-01T12:00:00+00:00"))


def test_a_live_session_is_not_edited_through_the_journal() -> None:
    tea_id = _tea()
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id))
    with pytest.raises(ValueError):
        sessions.edit_journal("alice", "s-1", _edit())


def test_only_the_brewer_edits_or_deletes_a_sitting() -> None:
    tea_id = _tea()
    share("alice", "bob")
    _finished(tea_id)
    with pytest.raises(PermissionError):
        sessions.edit_journal("bob", "s-1", _edit())
    with pytest.raises(PermissionError):
        sessions.delete_journal("bob", "s-1")


def test_deleting_a_sitting_gives_its_grams_back_and_removes_its_photo() -> None:
    tea_id = _tea(40)
    _finished(tea_id)
    sessions.save_image("alice", "s-1", JPEG, "image/jpeg")
    sessions.delete_journal("alice", "s-1")
    assert _grams(tea_id) == 40
    assert repo.find_image(cabinet_of("alice"), "s-1") is None
    assert sessions.list_journal("alice") == []


def test_a_give_back_never_lifts_a_tea_above_what_was_bought() -> None:
    tea_id = _tea(10, purchased=10)
    sessions.upsert("alice", "s-1", _entry(tea_id=tea_id, leaf_grams=20))
    assert _grams(tea_id) == 0
    sessions.delete_journal("alice", "s-1")
    assert _grams(tea_id) == 10


def test_a_live_session_is_not_deleted_through_the_journal() -> None:
    tea_id = _tea()
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id))
    with pytest.raises(ValueError):
        sessions.delete_journal("alice", "s-1")


def test_the_journal_lists_newest_first_whatever_shape_the_dates_take() -> None:
    tea_id = _tea()
    for session_id, started in [
        ("s-a", "2026-09-20"),
        ("s-b", "2026-09-21T08:00:00Z"),
        ("s-c", "2026-09-19T10:00:00+00:00"),
        ("s-d", "not a date"),
    ]:
        sessions.upsert("alice", session_id, _entry(tea_id=tea_id, started_at=started))
    assert [e.id for e in sessions.list_journal("alice")] == ["s-b", "s-a", "s-c", "s-d"]


def test_the_journal_resolves_each_tea_and_includes_every_member() -> None:
    tea_id = _tea()
    share("alice", "bob")
    sessions.upsert("bob", "s-1", _entry(tea_id=tea_id))
    sessions.upsert("alice", "s-2", _entry(tea_id=None, away_tea_name="Teahouse Dancong"))
    sessions.upsert(
        "alice", "s-3", _entry(tea_id=None, away_tea_name="Dian Hong", away_class_id="red")
    )
    sessions.upsert("alice", "s-4", _write(tea_id=tea_id))
    by_id = {e.id: e for e in sessions.list_journal("alice")}
    assert set(by_id) == {"s-1", "s-2", "s-3"}
    assert (by_id["s-1"].tea_name, by_id["s-1"].class_id, by_id["s-1"].brewed_by) == (
        "Tieguanyin",
        "oolong",
        "bob",
    )
    assert (by_id["s-2"].tea_name, by_id["s-2"].class_id) == ("Teahouse Dancong", "other")
    assert by_id["s-3"].class_id == "red"
