"""Per-word note persistence: shared notes + per-user private notes.

The notes twin of `vocab_repo`: a shared file both users read, and a per-user
private file read only for its owner (NFR-2 — path-as-privacy). Layering:
services call this; routers do not. Raises stdlib errors, never HTTPException.
The only filesystem code for notes.
"""

from __future__ import annotations

from pathlib import Path

from app.core.config import settings
from app.repositories import _storage
from app.schemas.hotaru import Note, Visibility

_HOTARU_DIR = settings.data_dir / "hotaru"
_SHARED_PATH = _HOTARU_DIR / "notes_shared.json"


def _private_path(user: str) -> Path:
    return _HOTARU_DIR / "users" / user / "notes_private.json"


def read_shared() -> list[Note]:
    rows = _storage.read_json(_SHARED_PATH, default=[])
    return [Note.model_validate(n) for n in rows]


def read_private(user: str) -> list[Note]:
    rows = _storage.read_json(_private_path(user), default=[])
    return [Note.model_validate(n) for n in rows]


def write_shared(notes: list[Note]) -> None:
    _storage.atomic_write_json(_SHARED_PATH, [n.model_dump(mode="json") for n in notes])


def write_private(user: str, notes: list[Note]) -> None:
    _storage.atomic_write_json(_private_path(user), [n.model_dump(mode="json") for n in notes])


def add(note: Note) -> None:
    """Append a note to the file its visibility dictates — shared to the shared
    file, private to the author's own private file (path boundary)."""
    if note.visibility == "shared":
        write_shared([*read_shared(), note])
    else:
        write_private(note.author, [*read_private(note.author), note])


def find(note_id: str, user: str) -> Note | None:
    """Locate a note visible to `user`: the shared file first, then the user's
    OWN private file. Another user's private file is never read, so a partner's
    private note is simply not found here (the service turns that into a 404)."""
    for note in read_shared():
        if note.id == note_id:
            return note
    for note in read_private(user):
        if note.id == note_id:
            return note
    return None


def set_visibility(note_id: str, user: str, visibility: Visibility) -> Note:
    """Flip a note's visibility by MOVING it between files (visibility is encoded
    by which file holds the note, so there is no field to mutate in place).

    Raises FileNotFoundError if `user` can't see the note, PermissionError if
    they aren't its author. Same-visibility is an idempotent no-op. The move is
    two atomic writes (add to dest, then remove from source): if the second write
    fails or the process dies between them, the note survives in BOTH files (a
    recoverable duplicate) rather than being lost — the safe failure direction,
    since the JSON-file store has no cross-file transaction."""
    note = find(note_id, user)
    if note is None:
        raise FileNotFoundError(note_id)
    if note.author != user:
        raise PermissionError(f"Note {note_id} is not yours to change.")
    if note.visibility == visibility:
        return note

    moved = note.model_copy(update={"visibility": visibility})
    # Add to the destination FIRST (add() routes by moved.visibility), THEN drop
    # it from the source — so a crash in between duplicates, never drops.
    add(moved)
    if note.visibility == "shared":
        write_shared([n for n in read_shared() if n.id != note_id])
    else:
        write_private(user, [n for n in read_private(user) if n.id != note_id])
    return moved


def replace(note: Note) -> None:
    """Rewrite a note (matched by id) in place in the file its visibility
    dictates. For a text edit that doesn't change which file holds it."""
    if note.visibility == "shared":
        write_shared([note if n.id == note.id else n for n in read_shared()])
    else:
        write_private(
            note.author, [note if n.id == note.id else n for n in read_private(note.author)]
        )


def remove(note_id: str, user: str) -> None:
    """Delete a note from wherever the caller can see it — the shared file if it's
    there, else the caller's own private file. Never the partner's private file
    (NFR-2). The note lives in exactly one file, so this is unambiguous."""
    shared = read_shared()
    if any(n.id == note_id for n in shared):
        write_shared([n for n in shared if n.id != note_id])
        return
    write_private(user, [n for n in read_private(user) if n.id != note_id])


def remove_for_word(word_id: str) -> None:
    """Purge every note for a word across the shared file AND all users' private
    files — for when the word itself is deleted, so no orphaned notes (incl.
    private ones) linger. This is the one notes-repo operation that touches other
    users' private files; it only ever REMOVES, never reads them into a response
    (so NFR-2's read-boundary is intact). Writes a file only if it changed."""
    shared = read_shared()
    kept = [n for n in shared if n.word_id != word_id]
    if len(kept) != len(shared):
        write_shared(kept)

    users_dir = _HOTARU_DIR / "users"
    if not users_dir.is_dir():
        return
    for user_dir in users_dir.iterdir():
        if not user_dir.is_dir():
            continue
        user = user_dir.name
        notes = read_private(user)
        remaining = [n for n in notes if n.word_id != word_id]
        if len(remaining) != len(notes):
            write_private(user, remaining)
