"""Business logic for Shared Notes.

Raises stdlib exceptions only — routers translate them into HTTP responses.

Access is membership, and nothing else: `resolve_note` is the single door every
single-note operation goes through, and it raises `FileNotFoundError` for a
non-member exactly as it does for a note that was never created. That is
deliberate (NFR-2) — a stranger must not be able to tell the two apart.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.repositories import shared_notes_repo as repo
from app.schemas.shared_notes import Note, NoteSummary, NoteView


def now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def new_id() -> str:
    return f"n-{uuid.uuid4().hex[:8]}"


def _clean_title(title: str) -> str:
    cleaned = title.strip()
    if not cleaned:
        raise ValueError("title must not be blank")
    return cleaned


def resolve_note(user: str, note_id: str) -> Note:
    """Load a note `user` may see, or raise `FileNotFoundError`.

    The membership check and the existence check collapse into one error on
    purpose — see the module docstring.
    """
    note = repo.read_note(note_id)
    if note is None or user not in note.members:
        raise FileNotFoundError(f"note not found: {note_id}")
    return note


def create_note(user: str, title: str) -> Note:
    """Mint a note owned by `user`, with `user` as its only member."""
    stamp = now_iso()
    note = Note(
        id=new_id(),
        title=_clean_title(title),
        body="",
        owner=user,
        members=[user],
        rev=0,
        created_at=stamp,
        updated_at=stamp,
    )
    repo.write_note(note)
    return note


def _view(note: Note, user: str) -> NoteView:
    return NoteView(
        id=note.id,
        title=note.title,
        body=note.body,
        owner=note.owner,
        members=note.members,
        rev=note.rev,
        can_manage=note.owner == user,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


def _summary(note: Note) -> NoteSummary:
    return NoteSummary(
        id=note.id,
        title=note.title,
        owner=note.owner,
        shared=len(note.members) > 1,
        updated_at=note.updated_at,
    )


def get_note(user: str, note_id: str) -> NoteView:
    return _view(resolve_note(user, note_id), user)


def list_notes(user: str) -> list[NoteSummary]:
    """Every note `user` can see, most recently edited first."""
    notes = repo.list_notes_for(user)
    notes.sort(key=lambda note: note.updated_at, reverse=True)
    return [_summary(note) for note in notes]


def update_note(
    user: str,
    note_id: str,
    title: str | None = None,
    body: str | None = None,
) -> NoteView:
    """Write the supplied fields, bump `rev` and restamp `updated_at`.

    Whole-field replacement, not a merge: the last save of a field wins
    (NFR-5). Story 2.2's live channel is what reconverges two open editors.
    """
    if title is None and body is None:
        raise ValueError("no updatable fields provided")

    # Validate before taking the lock so a rejected save never opens a
    # transaction it will only abandon.
    cleaned_title = _clean_title(title) if title is not None else None

    # Membership is checked inside the transaction, so a note that is unshared
    # between the check and the write cannot still be written by the ex-member.
    with repo.note_transaction(note_id) as note:
        if user not in note.members:
            raise FileNotFoundError(f"note not found: {note_id}")
        if cleaned_title is not None:
            note.title = cleaned_title
        if body is not None:
            note.body = body
        note.rev += 1
        note.updated_at = now_iso()
        updated = note.model_copy(deep=True)

    return _view(updated, user)


def delete_note(user: str, note_id: str) -> None:
    """Remove a note. Owner only — a member gets `PermissionError` (FR-9).

    A non-member gets `FileNotFoundError` from the resolver first, so a
    stranger cannot use the 403 to confirm the note exists.
    """
    note = resolve_note(user, note_id)
    if note.owner != user:
        raise PermissionError("only the owner can delete this note")
    repo.delete_note(note_id)
