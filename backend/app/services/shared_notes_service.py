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
from app.schemas.shared_notes import Note


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
