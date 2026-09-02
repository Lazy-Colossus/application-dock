"""Story 1.2 — the reason this app needed the platform lock first.

Six people share one login and click days on the same calendar on the same
evening, so concurrent read-modify-write of one document is KDH's normal case,
not an edge case.
"""

import threading
from pathlib import Path

import pytest

from app.repositories import kdh_repo as repo
from app.schemas.kdh import Calendar, Invitee
from app.services import kdh_service as service


@pytest.fixture(autouse=True)
def isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr("app.core.config.settings.data_dir", tmp_path)
    return tmp_path


def seed(calendar_id: str, invitee_count: int = 8) -> Calendar:
    calendar = Calendar(
        schema_version=repo.CURRENT_SCHEMA_VERSION,
        id=calendar_id,
        name="DnD",
        created_at=service.now_iso(),
        created_by="jake",
        updated_at=service.now_iso(),
        invitees=[
            Invitee(id=f"inv-{i:08d}", name=f"P{i}", color=f"#00000{i}", order=i)
            for i in range(invitee_count)
        ],
    )
    repo.write_calendar(calendar)
    return calendar


def run_together(fns: list) -> list[BaseException]:
    errors: list[BaseException] = []
    barrier = threading.Barrier(len(fns))

    def wrapped(fn):
        def inner() -> None:
            barrier.wait()
            try:
                fn()
            except BaseException as exc:  # pragma: no cover - surfaced by assert
                errors.append(exc)

        return inner

    threads = [threading.Thread(target=wrapped(fn)) for fn in fns]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return errors


def test_everyone_voting_on_one_day_at_once_keeps_every_vote(isolate: Path) -> None:
    calendar = seed("cal-party001")
    day = "2026-09-14"

    def vote(invitee_id: str) -> None:
        with repo.calendar_transaction(calendar.id) as doc:
            doc.votes.setdefault(day, {})[invitee_id] = "yes"

    errors = run_together([lambda i=i.id: vote(i) for i in calendar.invitees])

    assert not errors
    stored = repo.read_calendar(calendar.id)
    assert set(stored.votes[day]) == {i.id for i in calendar.invitees}


def test_votes_on_different_days_of_one_calendar_all_survive(isolate: Path) -> None:
    calendar = seed("cal-party002", invitee_count=1)
    voter = calendar.invitees[0].id
    days = [f"2026-09-{n:02d}" for n in range(1, 13)]

    def vote(day: str) -> None:
        with repo.calendar_transaction(calendar.id) as doc:
            doc.votes.setdefault(day, {})[voter] = "if_needed"

    errors = run_together([lambda d=d: vote(d) for d in days])

    assert not errors
    assert sorted(repo.read_calendar(calendar.id).votes) == days


def test_two_calendars_are_not_serialized_against_each_other(isolate: Path) -> None:
    """Different files must stay concurrent, or one group blocks another."""
    seed("cal-first001", invitee_count=1)
    seed("cal-second01", invitee_count=1)

    started = threading.Event()
    release = threading.Event()

    def hold_first() -> None:
        with repo.calendar_transaction("cal-first001"):
            started.set()
            release.wait(timeout=1)

    holder = threading.Thread(target=hold_first)
    holder.start()
    assert started.wait(timeout=1)

    # Would block until `release` if the lock key were not per-calendar.
    with repo.calendar_transaction("cal-second01") as doc:
        doc.name = "Renamed while the other calendar was held"

    assert repo.read_calendar("cal-second01").name.startswith("Renamed")
    release.set()
    holder.join()


def test_a_raising_transaction_writes_nothing(isolate: Path) -> None:
    calendar = seed("cal-rollback", invitee_count=1)

    with pytest.raises(ValueError):
        with repo.calendar_transaction(calendar.id) as doc:
            doc.name = "Should not persist"
            raise ValueError("rejected")

    assert repo.read_calendar(calendar.id).name == "DnD"
