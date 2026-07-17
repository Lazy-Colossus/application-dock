"""Business logic for cooperative per-word notes (F5).

Calls `notes_repo`; raises stdlib exceptions (no HTTPException). Privacy is the
one hard rule: a user sees shared notes + their OWN private notes, never another
user's private notes (they aren't even read — NFR-2, path boundary).
"""

from __future__ import annotations

from collections.abc import Iterable
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


def notes_for_words(word_ids: Iterable[str], user: str) -> dict[str, list[Note]]:
    """Batched `list_for_word` for many words (the drill queue): shared + the
    user's own private, grouped by `word_id`, oldest-first. Reads each file ONCE
    rather than per word (NFR-6). Words with no visible notes are absent from the
    map (callers default to []). Another user's private file is never read."""
    wanted = set(word_ids)
    visible = [n for n in notes_repo.read_shared() if n.word_id in wanted]
    visible += [n for n in notes_repo.read_private(user) if n.word_id in wanted]
    grouped: dict[str, list[Note]] = {}
    for note in sorted(visible, key=lambda n: n.created_at):
        grouped.setdefault(note.word_id, []).append(note)
    return grouped


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


def update_note(
    note_id: str,
    user: str,
    text: str | None = None,
    visibility: Visibility | None = None,
) -> Note:
    """Edit a note's text and/or flip its visibility (Story 3.6). Author-only.

    Reuses the aggregate's primitives rather than re-deriving the move: a text
    edit is an in-place `replace` (same file); a visibility change delegates to
    `set_visibility` (the crash-safe move), which re-reads the just-edited note.
    Raises FileNotFoundError (not visible to `user`), PermissionError (not the
    author), ValueError (empty/oversize text → 422)."""
    note = notes_repo.find(note_id, user)
    if note is None:
        raise FileNotFoundError(note_id)
    if note.author != user:
        raise PermissionError(f"Note {note_id} is not yours to change.")

    if text is not None:
        cleaned = text.strip()
        if not cleaned:
            raise ValueError("Note text must not be empty.")
        if len(cleaned) > MAX_NOTE_LENGTH:
            raise ValueError(f"Note must be {MAX_NOTE_LENGTH} characters or fewer.")
        note = note.model_copy(update={"text": cleaned})
        notes_repo.replace(note)

    if visibility is not None:
        # Moves the (possibly just-edited) note; a no-op if already that visibility.
        return notes_repo.set_visibility(note_id=note_id, user=user, visibility=visibility)
    return note


def words_with_notes(user: str) -> list[str]:
    """Word ids that have at least one note visible to `user` (shared + the
    user's own private) — powers the library's 'has a note' indicator. Reads
    each file once; never touches the partner's private file (NFR-2)."""
    ids = {n.word_id for n in notes_repo.read_shared()}
    ids |= {n.word_id for n in notes_repo.read_private(user)}
    return sorted(ids)


def remove_word_notes(word_id: str) -> None:
    """Cascade: drop every note for a word (shared + all users' private) when the
    word is deleted, so no orphaned notes remain."""
    notes_repo.remove_for_word(word_id)


def delete_note(note_id: str, user: str) -> None:
    """Delete a note the caller authored. Raises FileNotFoundError (not visible
    to `user`) / PermissionError (not the author)."""
    note = notes_repo.find(note_id, user)
    if note is None:
        raise FileNotFoundError(note_id)
    if note.author != user:
        raise PermissionError(f"Note {note_id} is not yours to delete.")
    notes_repo.remove(note_id, user)
