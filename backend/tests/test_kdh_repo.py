"""Story 1.2 — the KDH data layer.

KDH's storage is keyed by calendar id, not by username: the group shares one
dock login, so nothing here is per-user.
"""

from pathlib import Path

import pytest

from app.repositories import kdh_repo as repo
from app.schemas.kdh import Calendar, Invitee
from app.services import kdh_service as service


@pytest.fixture(autouse=True)
def isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr("app.core.config.settings.data_dir", tmp_path)
    return tmp_path


def make_calendar(
    calendar_id: str = "cal-ab12cd34", name: str = "DnD", created_at: str = ""
) -> Calendar:
    return Calendar(
        schema_version=repo.CURRENT_SCHEMA_VERSION,
        id=calendar_id,
        name=name,
        created_at=created_at or service.now_iso(),
        created_by="jake",
        updated_at=service.now_iso(),
        invitees=[Invitee(id="inv-1a2b3c4d", name="Dani", color="#e8643a", order=0)],
        votes={"2026-09-14": {"inv-1a2b3c4d": "yes"}},
        chosen_dates=["2026-09-14"],
    )


def test_round_trips_a_calendar(isolate: Path) -> None:
    original = make_calendar()
    repo.write_calendar(original)
    assert repo.read_calendar(original.id) == original


def test_first_write_creates_the_calendars_directory(isolate: Path) -> None:
    assert not (isolate / "kdh" / "calendars").exists()
    repo.write_calendar(make_calendar())
    assert (isolate / "kdh" / "calendars" / "cal-ab12cd34.json").is_file()


def test_reading_an_unknown_calendar_raises(isolate: Path) -> None:
    with pytest.raises(FileNotFoundError):
        repo.read_calendar("cal-nope")


def test_absent_optional_fields_default(isolate: Path) -> None:
    """A calendar with no invitees, votes or chosen dates is valid."""
    bare = Calendar(
        schema_version=1,
        id="cal-bare1234",
        name="Empty",
        created_at=service.now_iso(),
        created_by="dani",
        updated_at=service.now_iso(),
    )
    repo.write_calendar(bare)
    read = repo.read_calendar(bare.id)
    assert read.invitees == [] and read.votes == {} and read.chosen_dates == []


def test_delete_removes_the_file(isolate: Path) -> None:
    calendar = make_calendar()
    repo.write_calendar(calendar)
    repo.delete_calendar(calendar.id)
    with pytest.raises(FileNotFoundError):
        repo.read_calendar(calendar.id)


def test_delete_of_an_unknown_calendar_raises(isolate: Path) -> None:
    with pytest.raises(FileNotFoundError):
        repo.delete_calendar("cal-nope")


# ── listing (a directory scan, no index file) ────────────────────────────────


def test_list_is_empty_before_anything_is_written(isolate: Path) -> None:
    assert repo.list_calendars() == []


def test_list_returns_every_calendar_newest_first(isolate: Path) -> None:
    repo.write_calendar(make_calendar("cal-old00001", "Old", "2026-01-01T00:00:00Z"))
    repo.write_calendar(make_calendar("cal-new00001", "New", "2026-09-01T00:00:00Z"))
    repo.write_calendar(make_calendar("cal-mid00001", "Mid", "2026-05-01T00:00:00Z"))

    assert [c.name for c in repo.list_calendars()] == ["New", "Mid", "Old"]


def test_list_ignores_non_json_files(isolate: Path) -> None:
    repo.write_calendar(make_calendar())
    stray = isolate / "kdh" / "calendars" / "notes.txt"
    stray.write_text("not a calendar", encoding="utf-8")

    assert [c.id for c in repo.list_calendars()] == ["cal-ab12cd34"]


# ── the id is untrusted input: it round-trips through the URL path ───────────


@pytest.mark.parametrize(
    "unsafe",
    ["", "   ", "..", ".", "../escape", "a/b", "a\\b", " cal-1", "cal-1 "],
)
def test_unsafe_calendar_ids_are_rejected(isolate: Path, unsafe: str) -> None:
    with pytest.raises(ValueError):
        repo._calendar_path(unsafe)


def test_a_traversing_id_never_writes_outside_the_calendars_dir(isolate: Path) -> None:
    with pytest.raises(ValueError):
        repo.read_calendar("../../_auth")
    assert not (isolate / "_auth.json").exists()


# ── schema ───────────────────────────────────────────────────────────────────


def test_migrate_is_a_passthrough_at_v1() -> None:
    raw = {"schema_version": 1, "id": "cal-1"}
    assert repo.migrate(raw) == raw


def test_stored_document_shape_matches_the_spec(isolate: Path) -> None:
    repo.write_calendar(make_calendar())
    import json

    raw = json.loads((isolate / "kdh" / "calendars" / "cal-ab12cd34.json").read_text())
    assert raw["votes"] == {"2026-09-14": {"inv-1a2b3c4d": "yes"}}
    assert raw["invitees"][0]["removed_at"] is None
    assert raw["chosen_dates"] == ["2026-09-14"]
    assert "created_by" in raw and "updated_at" in raw
