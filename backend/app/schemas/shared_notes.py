"""Pydantic v2 schemas for Shared Notes (Story 1.2).

One JSON file per note at `DATA_DIR/shared-notes/notes/{note_id}.json`. A note
is its own document from the moment it is created — unlike Listies, which keeps
sheets inside a per-user file and only promotes one when it is shared. Sharing
is this app's whole point, so there is no promotion step and no per-user index:
`members` on the note is the only access record, and listing scans the files.

`owner` is always `members[0]`. `rev` is bumped on every content write; nothing
reads it until the live channel arrives in Story 2.2.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class Note(BaseModel):
    """A note as persisted."""

    schema_version: int = 1
    id: str
    title: str
    body: str = ""
    owner: str
    members: list[str] = Field(default_factory=list)
    rev: int = 0
    created_at: str
    updated_at: str


class NoteSummary(BaseModel):
    """A note as the home list sees it — no body, so the list stays cheap."""

    id: str
    title: str
    owner: str
    shared: bool = False
    updated_at: str


class NoteView(BaseModel):
    """A note as the editor sees it, plus what the caller may do with it.

    `can_manage` is true only for the owner: it gates delete now and membership
    management in Epic 2. Members edit title and body but manage neither.
    """

    id: str
    title: str
    body: str = ""
    owner: str
    members: list[str] = Field(default_factory=list)
    rev: int = 0
    can_manage: bool = False
    created_at: str
    updated_at: str


# ── Request bodies ────────────────────────────────────────────────────────────


class CreateNoteRequest(BaseModel):
    title: str


class UpdateNoteRequest(BaseModel):
    # Both optional so a save can carry the title, the body, or both. A body of
    # `""` is a real value (the note was cleared); `None` means "leave it".
    title: str | None = None
    body: str | None = None
