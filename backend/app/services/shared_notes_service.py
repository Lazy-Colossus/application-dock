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
from app.services import auth_service
from app.services import shared_notes_events as events


def now_iso() -> str:
    """An ISO-8601 UTC stamp with millisecond precision.

    Finer than the platform's usual second stamp because `updated_at` is the
    sort key for the note list, and two saves inside one second are ordinary
    here — a shared note takes writes from several people at once. At second
    precision those tie, and the list order becomes arbitrary.
    """
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


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
    # `id` breaks a tie so the order is total: equal stamps must not leave the
    # list in whatever sequence the directory happened to be read in.
    notes.sort(key=lambda note: (note.updated_at, note.id), reverse=True)
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

    # Published after the transaction commits, so a subscriber that refetches
    # immediately cannot read the note before the new revision is on disk.
    events.publish(
        note_id,
        {
            "type": "note.changed",
            "note_id": note_id,
            "rev": updated.rev,
            "actor": user,
        },
    )
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
    events.publish(
        note_id,
        {"type": "note.closed", "note_id": note_id, "reason": "deleted"},
    )


# ── membership (Story 2.1) ────────────────────────────────────────────────────


def _require_owned(caller: str, note_id: str) -> Note:
    """Fetch a note the caller **owns**, for a management operation.

    Resolves first, so a non-member gets `FileNotFoundError` (404) and never the
    `PermissionError` (403) that would confirm the note exists. The 403 is
    reserved for a member who is not the owner (NFR-2, FR-9).
    """
    note = resolve_note(caller, note_id)
    if note.owner != caller:
        raise PermissionError("only the owner can manage this note")
    return note


def _validate_targets(usernames: list[str]) -> None:
    """Reject unknown usernames before anything is written.

    Checked up front so a batch containing one bad name leaves membership
    entirely unchanged rather than half-applied.
    """
    known = set(auth_service.list_usernames())
    for username in usernames:
        if username not in known:
            raise ValueError(f"unknown user: {username}")


def _publish_members(note_id: str, members: list[str]) -> None:
    events.publish(
        note_id,
        {"type": "members.changed", "note_id": note_id, "members": members},
    )


def share_note(owner: str, note_id: str, usernames: list[str]) -> NoteView:
    """Add members to a note the caller owns (owner-only, FR-8).

    Unions rather than replaces, so re-sharing with an existing member is a
    no-op and two owners' additions cannot erase each other.
    """
    _require_owned(owner, note_id)
    _validate_targets(usernames)

    with repo.note_transaction(note_id) as note:
        for username in usernames:
            if username not in note.members:
                note.members.append(username)
        # Membership is not content: `updated_at` moves, `rev` does not.
        note.updated_at = now_iso()
        updated = note.model_copy(deep=True)

    _publish_members(note_id, updated.members)
    return _view(updated, owner)


def remove_member(owner: str, note_id: str, username: str) -> NoteView:
    """Remove a member from a note the caller owns (owner-only, FR-8).

    Removing someone who is not a member is a no-op, so a double-click cannot
    fail. The owner cannot be removed — ownership transfer is out of scope, and
    to fully un-share the owner removes everyone else.
    """
    _require_owned(owner, note_id)
    if username == owner:
        raise ValueError("the owner cannot be removed")

    with repo.note_transaction(note_id) as note:
        if username in note.members:
            note.members.remove(username)
        note.updated_at = now_iso()
        updated = note.model_copy(deep=True)

    # The remaining members refresh their roster; the removed member's editor
    # closes. The close carries `member` so only they act on it.
    _publish_members(note_id, updated.members)
    events.publish(
        note_id,
        {
            "type": "note.closed",
            "note_id": note_id,
            "reason": "removed",
            "member": username,
        },
    )
    return _view(updated, owner)
