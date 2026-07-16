"""Business logic for cooperative per-word notes (F5).

Calls `notes_repo`; raises stdlib exceptions (no HTTPException). Privacy is the
one hard rule: a user sees shared notes + their OWN private notes, never another
user's private notes (they aren't even read — NFR-2, path boundary).
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from app.repositories import notes_repo
from app.schemas.hotaru import Note, Visibility

MAX_NOTE_LENGTH = 300


def list_for_word(word_id: str, user: str) -> list[Note]:
    """A word's notes for the active user: shared + the user's own private,
    oldest-first. Another user's private notes are never read."""
    notes = [n for n in notes_repo.read_shared() if n.word_id == word_id]
    notes += [n for n in notes_repo.read_private(user) if n.word_id == word_id]
    return sorted(notes, key=lambda n: n.created_at)


def create_note(
    word_id: str,
    author: str,
    text: str,
    visibility: Visibility = "shared",
    now: datetime | None = None,
) -> Note:
    """Persist a note (to the shared file or the author's private file). Raises
    ValueError on empty text. `now` is injected so tests stay deterministic."""
    cleaned = text.strip()
    if not cleaned:
        raise ValueError("Note text must not be empty.")
    if len(cleaned) > MAX_NOTE_LENGTH:
        raise ValueError(f"Note must be {MAX_NOTE_LENGTH} characters or fewer.")
    note = Note(
        id=f"n-{uuid4().hex[:8]}",
        word_id=word_id,
        author=author,
        text=cleaned,
        visibility=visibility,
        created_at=now or datetime.now(UTC),
    )
    notes_repo.add(note)
    return note


def set_note_visibility(note_id: str, user: str, visibility: Visibility) -> Note:
    """Flip a note between shared and the author's private file. Raises
    FileNotFoundError (not visible to `user`) / PermissionError (not the author)."""
    return notes_repo.set_visibility(note_id=note_id, user=user, visibility=visibility)
