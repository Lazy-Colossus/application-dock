"""Shared Notes API router.

Notes are documents with a membership list, not per-user files: every route is
scoped to the authenticated user via `get_current_user`, and that username is
what decides which notes exist as far as the caller is concerned. `owner` and
`members` are derived from it and are never read off the request body.

Exception mapping lives here and nowhere below: `FileNotFoundError → 404`,
`ValueError → 422`, `PermissionError → 403`.
"""

import asyncio
import json
from collections.abc import AsyncIterator, Awaitable, Callable

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from app.core.dependencies import get_current_user, user_from_token
from app.schemas.shared_notes import (
    CreateNoteRequest,
    NoteSummary,
    NoteView,
    ShareRequest,
    UpdateNoteRequest,
)
from app.services import shared_notes_events as events
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


# ── live events / SSE (Story 2.2) ─────────────────────────────────────────────

_KEEPALIVE_SECONDS = 15


async def sse_frames(
    note_id: str,
    queue: "asyncio.Queue[dict]",
    is_disconnected: Callable[[], Awaitable[bool]],
    keepalive: float = _KEEPALIVE_SECONDS,
) -> AsyncIterator[str]:
    """Format a subscriber's queue as an SSE frame stream until disconnect.

    Yields an opening comment, then one `data:` frame per event, with periodic
    `: ping` keep-alives during idle so a proxy does not drop the connection.
    Always unsubscribes in the `finally`. Factored out of the route so it can be
    unit-tested without an (unbounded) HTTP stream.
    """
    try:
        # An immediate comment opens the stream and flushes past proxies.
        yield ": connected\n\n"
        while True:
            if await is_disconnected():
                break
            try:
                event = await asyncio.wait_for(queue.get(), timeout=keepalive)
            except TimeoutError:
                yield ": ping\n\n"
                continue
            yield f"data: {json.dumps(event)}\n\n"
            if events.is_stale(note_id, queue):
                # This subscriber overflowed and has missed events; drop it
                # rather than serve a silently incomplete stream. It resyncs on
                # reconnect, since a refetch carries the current `rev`.
                break
    finally:
        events.unsubscribe(note_id, queue)


@router.get("/notes/{note_id}/events")
async def note_events(
    note_id: str,
    request: Request,
    token: str = Query(...),
) -> StreamingResponse:
    """Server-Sent Events stream for a note.

    Authenticated via `?token=` because an `EventSource` cannot send an
    `Authorization` header — verified with the same logic as the bearer path. A
    caller who cannot access the note gets the same 404 as every other note
    route, so the stream never reveals that a note exists.
    """
    username = user_from_token(token)  # 401 on a missing/invalid token
    try:
        service.get_note(username, note_id)  # membership gate → 404 if no access
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Note not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    queue = events.subscribe(note_id)
    return StreamingResponse(
        sse_frames(note_id, queue, request.is_disconnected),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # tell nginx not to buffer the stream
        },
    )
