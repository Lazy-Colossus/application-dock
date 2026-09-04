"""Story 1.8 — one concurrency test per persistence module that adopted the
per-file transaction. Each drives the real service layer, because the lost
update the story is about happens between a service's read and its write.
"""

import threading
from pathlib import Path

import pytest

from app.services import archery_service, auth_service, hotaru_vocab_service, listies_service


@pytest.fixture(autouse=True)
def isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr("app.core.config.settings.data_dir", tmp_path)
    return tmp_path


def run_together(fns: list) -> list[BaseException]:
    """Start every callable at the same moment and collect anything that raised."""
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


# ── Archery ──────────────────────────────────────────────────────────────────


def test_concurrent_session_creates_get_distinct_labels() -> None:
    """Label allocation reads every taken label, so it must sit inside the write
    transaction — otherwise two same-day creates both claim `YYYY-MM-DD` and the
    second silently replaces the first."""
    n = 6
    created: list[str] = []
    lock = threading.Lock()

    def create(i: int) -> None:
        session = archery_service.create_session(archers=[f"archer{i}"])
        with lock:
            created.append(session.label)

    errors = run_together([lambda i=i: create(i) for i in range(n)])

    assert not errors
    assert len(set(created)) == n, f"duplicate labels allocated: {sorted(created)}"
    assert len(archery_service.list_in_progress_summaries()) == n


def test_concurrent_finalises_that_both_need_a_suffix_get_distinct_labels() -> None:
    """The `_pick_finalise_label` duplicate-label defer, closed.

    The race only bites when two finalises both fall through to the suffix
    search, so the state is built directly: two finalised files already occupy
    the preferred labels of the two in-progress sessions, forcing both to scan
    for the next free suffix at the same moment. Unguarded, both scans see the
    same set and both claim `-3` — one session overwriting the other.
    """
    from app.core.config import settings
    from app.repositories import session_repo
    from app.schemas.session import SessionData

    day = "2026-09-03"

    def session(label: str, status: str) -> SessionData:
        return SessionData(
            label=label,
            name=label,
            date=day,
            created=f"{day}T10:00:00Z",
            status=status,
            archers=["a"],
            targets=[],
        )

    # Both preferred labels are already taken by finalised sessions...
    for label in (day, f"{day}-2"):
        session_repo.write_session(settings.data_dir / f"{label}.json", session(label, "finalised"))
    # ...so both of these must fall through to the suffix search.
    for label in (day, f"{day}-2"):
        session_repo.write_in_progress(session(label, "in_progress"))

    finalised: list[str] = []
    lock = threading.Lock()

    def finalise(label: str) -> None:
        result = archery_service.finalise_in_progress(label)
        with lock:
            finalised.append(result.label)

    errors = run_together([lambda label=label: finalise(label) for label in (day, f"{day}-2")])

    assert not errors
    assert sorted(finalised) == [f"{day}-3", f"{day}-4"], f"collided on {sorted(finalised)}"
    assert len(archery_service.list_history()) == 4


def test_concurrent_recurring_player_adds_all_persist() -> None:
    names = [f"player{i}" for i in range(8)]
    errors = run_together([lambda n=n: archery_service.add_recurring_player(n) for n in names])

    assert not errors
    assert set(archery_service.list_recurring_players()) == set(names)


# ── Listies ──────────────────────────────────────────────────────────────────


def test_concurrent_sheet_creates_all_persist() -> None:
    from app.schemas.listies import ColumnSpec

    n = 8
    columns = [ColumnSpec(name="Item", type="text")]
    errors = run_together(
        [lambda i=i: listies_service.create_sheet("ann", f"sheet-{i}", columns) for i in range(n)]
    )

    assert not errors
    assert {s.name for s in listies_service.list_sheets("ann")} == {f"sheet-{i}" for i in range(n)}


# ── Hotaru ───────────────────────────────────────────────────────────────────


def test_concurrent_word_creates_all_persist() -> None:
    n = 8
    errors = run_together(
        [
            lambda i=i: hotaru_vocab_service.create_word(
                user="ann", reading=f"reading{i}", meaning=f"meaning{i}"
            )
            for i in range(n)
        ]
    )

    assert not errors
    words = hotaru_vocab_service.list_words(user="ann")
    readings = {w.reading for w in words}
    assert all(f"reading{i}" in readings for i in range(n))


# ── Auth ─────────────────────────────────────────────────────────────────────


def test_concurrent_user_creates_all_persist() -> None:
    n = 6
    errors = run_together([lambda i=i: auth_service.create_user(f"user{i}") for i in range(n)])

    assert not errors
    assert set(auth_service.list_usernames()) == {f"user{i}" for i in range(n)}


def test_concurrent_duplicate_user_creates_admit_exactly_one() -> None:
    """The check-then-append must be atomic, or two racers both see 'free'."""
    outcomes: list[str] = []
    lock = threading.Lock()

    def create() -> None:
        try:
            auth_service.create_user("clash")
            result = "created"
        except ValueError:
            result = "rejected"
        with lock:
            outcomes.append(result)

    errors = run_together([create for _ in range(5)])

    assert not errors
    assert outcomes.count("created") == 1
    assert auth_service.list_usernames() == ["clash"]
