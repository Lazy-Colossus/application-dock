"""Shared Notes API router.

Notes are documents with a membership list, not per-user files: every route is
scoped to the authenticated user via `get_current_user`, and that username is
what decides which notes exist as far as the caller is concerned. `owner` and
`members` are derived from it and are never read off the request body.

Exception mapping lives here and nowhere below: `FileNotFoundError → 404`,
`ValueError → 422`, `PermissionError → 403`.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_user
from app.schemas.shared_notes import (
    CreateNoteRequest,
    NoteSummary,
    NoteView,
    ShareRequest,
    UpdateNoteRequest,
)
from app.services import shared_notes_service as service

router = APIRouter(prefix="/api/shared-notes", tags=["shared-notes"])


@router.get("/notes", response_model=list[NoteSummary])
def list_notes(current_user: str = Depends(get_current_user)) -> list[NoteSummary]:
    return service.list_notes(current_user)


@router.post("/notes", response_model=NoteView)
def create_note(
    req: CreateNoteRequest,
    current_user: str = Depends(get_current_user),
) -> NoteView:
    try:
        note = service.create_note(current_user, req.title)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return service.get_note(current_user, note.id)


@router.get("/notes/{note_id}", response_model=NoteView)
def get_note(note_id: str, current_user: str = Depends(get_current_user)) -> NoteView:
    try:
        return service.get_note(current_user, note_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Note not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/notes/{note_id}", response_model=NoteView)
def update_note(
    note_id: str,
    req: UpdateNoteRequest,
    current_user: str = Depends(get_current_user),
) -> NoteView:
    # PUT (not PATCH) to match the frontend `useApi` boundary, which exposes
    # get/post/put/del only — consistent with the other apps.
    try:
        return service.update_note(current_user, note_id, req.title, req.body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Note not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/notes/{note_id}", status_code=204)
def delete_note(note_id: str, current_user: str = Depends(get_current_user)) -> None:
    try:
        service.delete_note(current_user, note_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Note not found") from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


# ── membership (Story 2.1) ────────────────────────────────────────────────────


@router.post("/notes/{note_id}/share", response_model=NoteView)
def share_note(
    note_id: str,
    req: ShareRequest,
    current_user: str = Depends(get_current_user),
) -> NoteView:
    try:
        return service.share_note(current_user, note_id, req.usernames)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Note not found") from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/notes/{note_id}/share/{username}", response_model=NoteView)
def remove_member(
    note_id: str,
    username: str,
    current_user: str = Depends(get_current_user),
) -> NoteView:
    try:
        return service.remove_member(current_user, note_id, username)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Note not found") from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
