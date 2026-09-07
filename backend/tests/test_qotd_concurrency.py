"""Story 1.3 — per-day write serialization.

Many people answer the same question at the same moment; the per-file lock in
`day_transaction` is what stops their read-modify-writes clobbering one another.
These tests are proven non-vacuous by the last one, which disables the lock and
shows the lost updates the lock exists to prevent.
"""

from __future__ import annotations

import threading
import time
from contextlib import contextmanager
from pathlib import Path

import pytest

from app.repositories import qotd_repo as repo
from app.schemas.qotd import Answer
from app.services import qotd_service as service

N = 8


@pytest.fixture(autouse=True)
def isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr("app.core.config.settings.data_dir", tmp_path)
    return tmp_path


def _answer(text: str) -> Answer:
    stamp = service.now_iso()
    return Answer(text=text, created_at=stamp, updated_at=stamp)


def _upsert_concurrently(day: str, count: int) -> tuple[int, list[BaseException]]:
    """Fire `count` threads, each upserting a distinct user's answer on `day`.

    A barrier releases them together and a small sleep inside each transaction
    widens the read→write window, so an unserialized run reliably loses updates.
    Returns the number of answers that survived and any errors raised.
    """
    barrier = threading.Barrier(count)
    errors: list[BaseException] = []

    def work(i: int) -> None:
        try:
            barrier.wait()
            with repo.day_transaction(day) as document:
                document.question_id = "q-test"
                time.sleep(0.02)
                document.answers[f"user{i}"] = _answer(f"answer {i}")
        except BaseException as exc:  # noqa: BLE001 — surfaced to the assertion
            errors.append(exc)

    threads = [threading.Thread(target=work, args=(i,)) for i in range(count)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    return len(repo.read_day(day).answers), errors


def test_concurrent_answers_on_one_day_all_survive() -> None:
    survived, errors = _upsert_concurrently("2026-09-06", N)
    assert not errors
    assert survived == N


def test_different_months_are_not_serialized_against_each_other() -> None:
    # Days are bucketed by month, so two different months key on different files
    # and their transactions run concurrently. Proven by both completing well
    # under the sum of their held times (each holds the lock ~0.05s; run serially
    # that is ~0.1s). Days within the *same* month share a lock (and so
    # serialize) — cheap and correct at this scale.
    def hold(day: str) -> None:
        with repo.day_transaction(day):
            time.sleep(0.05)

    start = time.perf_counter()
    a = threading.Thread(target=hold, args=("2026-09-06",))
    b = threading.Thread(target=hold, args=("2026-10-06",))
    a.start()
    b.start()
    a.join()
    b.join()
    elapsed = time.perf_counter() - start
    assert elapsed < 0.09  # overlapped, not summed


def test_lost_update_without_the_lock(monkeypatch: pytest.MonkeyPatch) -> None:
    """The non-vacuity proof: with the lock disabled, answers are lost.

    Confirms the lock is what makes `test_concurrent_answers_on_one_day_all_survive`
    pass — with a no-op lock the concurrent read-modify-writes either clobber
    each other (fewer answers survive) or collide on the shared file.
    """

    @contextmanager
    def _no_lock(key: str):  # type: ignore[no-untyped-def]
        yield

    monkeypatch.setattr(repo, "key_lock", _no_lock)

    survived, errors = _upsert_concurrently("2026-09-06", N)
    # Without serialization the run does NOT cleanly preserve all N answers:
    # either updates were lost, or concurrent writers collided on the file.
    assert survived < N or errors
