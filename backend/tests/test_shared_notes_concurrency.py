"""Concurrent saves to one note must not lose an update.

Two members editing the same note at once is Shared Notes' ordinary case, not
an exotic one — every save is a read-modify-write that bumps `rev`, so without
the repo's lock one of two simultaneous writes is silently overwritten.
"""

from __future__ import annotations

import threading
from pathlib import Path

import pytest

from app.repositories import shared_notes_repo as repo
from app.services import shared_notes_service as service


@pytest.fixture()
def isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr("app.core.config.settings.data_dir", tmp_path)
    return tmp_path


def _run(fns: list) -> list[BaseException]:
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


def test_concurrent_saves_each_bump_rev(isolate: Path) -> None:
    """Eight simultaneous saves → rev 8. Unguarded, most bumps would be lost."""
    note = service.create_note("ana", "Groceries")
    with repo.note_transaction(note.id) as opened:
        opened.members.extend(f"member{i}" for i in range(8))

    errors = _run(
        [
            (lambda i=i: service.update_note(f"member{i}", note.id, body=f"line {i}"))
            for i in range(8)
        ]
    )
    assert errors == []

    final = repo.read_note(note.id)
    assert final is not None
    assert final.rev == 8


def test_concurrent_saves_to_different_notes_do_not_block_each_other(isolate: Path) -> None:
    """The lock is keyed by path, so unrelated notes still write in parallel."""
    notes = [service.create_note("ana", f"Note {i}") for i in range(8)]

    errors = _run([(lambda n=n: service.update_note("ana", n.id, body="x")) for n in notes])
    assert errors == []
    assert all(repo.read_note(n.id).rev == 1 for n in notes)  # type: ignore[union-attr]
