"""Filesystem persistence for Shared Notes — one JSON file per note.

This module is the ONLY code in the app that touches the filesystem for notes.
All writes go through the atomic write-then-rename helper. The filename is the
note id, validated as a bare filename so a crafted id can never escape the
`notes/` directory.

Layering: callers MUST be services. Routers do not call this directly.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from app.core.config import settings
from app.core.locks import key_lock
from app.core.storage import atomic_write_json
from app.schemas.shared_notes import Note

_APP_DIR = "shared-notes"


def _validate_note_id(note_id: str) -> str:
    """Ensure `note_id` is a safe bare filename, never a path.

    Stricter than the equivalent in `listies_repo`: any `.` is rejected, not
    just a bare `.`/`..`. Ids are minted as `n-{hex8}` and never contain a dot,
    so nothing legitimate is lost, and `..` traversal and `foo.json` collisions
    both die on the same check.
    """
    if not note_id or not note_id.strip():
        raise ValueError("note_id must be non-empty")
    if note_id != note_id.strip():
        raise ValueError("note_id must not have surrounding whitespace")
    if "/" in note_id or "\\" in note_id or "." in note_id:
        raise ValueError(f"unsafe note_id: {note_id!r}")
    return note_id


def _notes_dir() -> Path:
    return settings.data_dir / _APP_DIR / "notes"


def _note_path(note_id: str) -> Path:
    _validate_note_id(note_id)
    return _notes_dir() / f"{note_id}.json"


# A stamp written before note timestamps gained millisecond precision.
_SECOND_PRECISION = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


def migrate(raw: dict[str, object]) -> dict[str, object]:
    """Upgrade a raw note to the current shape, before validation.

    The single home for future `schema_version` bumps, so `read_note` never has
    to grow version branches inline.

    Timestamps are normalised to millisecond precision. Ordering compares these
    strings, and `"...:18Z"` sorts *after* `"...:18.500Z"` because `Z` > `.` —
    so a note written before the change would otherwise appear newer than one
    saved half a second later. Normalising on read fixes the comparison without
    rewriting files; the next save persists the new form anyway.
    """
    for field in ("created_at", "updated_at"):
        value = raw.get(field)
        if isinstance(value, str) and _SECOND_PRECISION.match(value):
            raw[field] = f"{value[:-1]}.000Z"
    return raw


def read_note(note_id: str) -> Note | None:
    """Read a note, or `None` if it has no file yet."""
    path = _note_path(note_id)
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None
    return Note.model_validate(migrate(json.loads(raw)))


def write_note(note: Note) -> None:
    """Persist a note atomically, creating `notes/` on first write."""
    atomic_write_json(_note_path(note.id), note.model_dump(mode="json"))


def delete_note(note_id: str) -> None:
    """Remove a note's file; a missing file is not an error."""
    _note_path(note_id).unlink(missing_ok=True)


def list_notes_for(username: str) -> list[Note]:
    """Every note `username` is a member of, owner included.

    Scans the notes directory rather than consulting a per-user index: access
    is membership and membership lives on the note, so an index would be a
    second source of truth to keep in step. Fine at this platform's scale.
    """
    directory = _notes_dir()
    if not directory.is_dir():
        return []
    notes: list[Note] = []
    for path in sorted(directory.glob("*.json")):
        note = Note.model_validate(migrate(json.loads(path.read_text(encoding="utf-8"))))
        if username in note.members:
            notes.append(note)
    return notes


@contextmanager
def note_transaction(note_id: str) -> Iterator[Note]:
    """Read-modify-write one note under that file's lock.

    Every note mutation is a read-modify-write (it bumps `rev`), so without the
    lock two members saving at once can each read the same `rev` and one write
    lands on top of the other. The lock is keyed by path, so saves to different
    notes still run fully concurrently. Nothing is written if the block raises.

    Raises `FileNotFoundError` if the note does not exist.
    """
    with key_lock(str(_note_path(note_id))):
        note = read_note(note_id)
        if note is None:
            raise FileNotFoundError(f"note not found: {note_id}")
        yield note
        write_note(note)
