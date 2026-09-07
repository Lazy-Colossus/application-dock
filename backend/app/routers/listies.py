"""Listies API router.

Per-user sheets of typed columns. Every route is scoped to the authenticated
user via `get_current_user`; the username selects the on-disk file (never taken
from request input).
"""

import asyncio
import json
from collections.abc import AsyncIterator, Awaitable, Callable

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from app.core.dependencies import get_current_user, user_from_token
from app.schemas.listies import (
    AddColumnRequest,
    CreateRowRequest,
    CreateSheetRequest,
    CreateTabRequest,
    MapsConfig,
    PlaceResult,
    ReorderColumnsRequest,
    Row,
    ShareRequest,
    Sheet,
    SheetSummary,
    SheetView,
    Tab,
    UpdateColumnRequest,
    UpdateRowRequest,
    UpdateSheetRequest,
    UpdateTabRequest,
)
from app.services import listies_events as events
from app.services import listies_service as service
from app.services import places_service

router = APIRouter(prefix="/api/listies", tags=["listies"])


@router.get("/sheets", response_model=list[SheetSummary])
def list_sheets(current_user: str = Depends(get_current_user)) -> list[SheetSummary]:
    return service.list_sheets(current_user)


@router.post("/sheets", response_model=Sheet)
def create_sheet(req: CreateSheetRequest, current_user: str = Depends(get_current_user)) -> Sheet:
    try:
        return service.create_sheet(current_user, req.name, req.columns)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/sheets/{sheet_id}", response_model=SheetView)
def update_sheet(
    sheet_id: str,
    req: UpdateSheetRequest,
    current_user: str = Depends(get_current_user),
) -> SheetView:
    # PUT (not PATCH) to match the frontend `useApi` boundary, which exposes
    # get/post/put/del only — consistent with the other apps.
    if req.name is None:
        raise HTTPException(status_code=422, detail="No updatable fields provided")
    try:
        return service.update_sheet(current_user, sheet_id, req.name)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Sheet not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/sheets/{sheet_id}", status_code=204)
def delete_sheet(sheet_id: str, current_user: str = Depends(get_current_user)) -> None:
    try:
        service.delete_sheet(current_user, sheet_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Sheet not found") from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/sheets/{sheet_id}", response_model=SheetView)
def get_sheet(sheet_id: str, current_user: str = Depends(get_current_user)) -> SheetView:
    try:
        return service.get_sheet(current_user, sheet_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Sheet not found") from exc


# ── sharing (Story 5.1) ─────────────────────────────────────────────────────────


@router.post("/sheets/{sheet_id}/share", response_model=SheetView)
def share_sheet(
    sheet_id: str,
    req: ShareRequest,
    current_user: str = Depends(get_current_user),
) -> SheetView:
    try:
        return service.share_sheet(current_user, sheet_id, req.usernames)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Sheet not found") from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/sheets/{sheet_id}/share/{username}", response_model=SheetView)
def remove_member(
    sheet_id: str,
    username: str,
    current_user: str = Depends(get_current_user),
) -> SheetView:
    try:
        return service.remove_member(current_user, sheet_id, username)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Sheet not found") from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/sheets/{sheet_id}/share", response_model=SheetView)
def stop_sharing(sheet_id: str, current_user: str = Depends(get_current_user)) -> SheetView:
    try:
        return service.stop_sharing(current_user, sheet_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Sheet not found") from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


# ── live events / SSE (Story 5.2) ───────────────────────────────────────────────

_KEEPALIVE_SECONDS = 15


async def sse_frames(
    sheet_id: str,
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
            if events.is_stale(sheet_id, queue):
                break  # overflowed — drop; the client resyncs on reconnect
    finally:
        events.unsubscribe(sheet_id, queue)


@router.get("/sheets/{sheet_id}/events")
async def sheet_events(
    sheet_id: str,
    request: Request,
    token: str = Query(...),
) -> StreamingResponse:
    """Server-Sent Events stream for a shared sheet.

    Authenticated via `?token=` because an `EventSource` cannot send an
    `Authorization` header — verified with the same logic as the bearer path. A
    caller who cannot access the sheet gets the same 404 as every other sheet
    route, so the stream never reveals a sheet's existence.
    """
    username = user_from_token(token)  # 401 on a missing/invalid token
    try:
        service.get_sheet(username, sheet_id)  # membership gate → 404 if no access
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Sheet not found") from exc

    queue = events.subscribe(sheet_id)
    return StreamingResponse(
        sse_frames(sheet_id, queue, request.is_disconnected),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # tell nginx not to buffer the stream
        },
    )


@router.post("/sheets/{sheet_id}/tabs/{tab_id}/rows", response_model=Row)
def create_row(
    sheet_id: str,
    tab_id: str,
    req: CreateRowRequest,
    current_user: str = Depends(get_current_user),
) -> Row:
    try:
        return service.create_row(current_user, sheet_id, tab_id, req.cells)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/sheets/{sheet_id}/tabs/{tab_id}/rows/{row_id}", response_model=Row)
def update_row(
    sheet_id: str,
    tab_id: str,
    row_id: str,
    req: UpdateRowRequest,
    current_user: str = Depends(get_current_user),
) -> Row:
    try:
        return service.update_row_cells(current_user, sheet_id, tab_id, row_id, req.cells)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/sheets/{sheet_id}/tabs/{tab_id}/rows/{row_id}", status_code=204)
def delete_row(
    sheet_id: str,
    tab_id: str,
    row_id: str,
    current_user: str = Depends(get_current_user),
) -> None:
    try:
        service.delete_row(current_user, sheet_id, tab_id, row_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/sheets/{sheet_id}/tabs/{tab_id}/columns", response_model=Tab)
def add_column(
    sheet_id: str,
    tab_id: str,
    req: AddColumnRequest,
    current_user: str = Depends(get_current_user),
) -> Tab:
    try:
        return service.add_column(current_user, sheet_id, tab_id, req.name, req.type)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


# Declared BEFORE /columns/{column_id} — otherwise "order" matches as an id.
@router.put("/sheets/{sheet_id}/tabs/{tab_id}/columns/order", response_model=Tab)
def reorder_columns(
    sheet_id: str,
    tab_id: str,
    req: ReorderColumnsRequest,
    current_user: str = Depends(get_current_user),
) -> Tab:
    try:
        return service.reorder_columns(current_user, sheet_id, tab_id, req.column_ids)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/sheets/{sheet_id}/tabs/{tab_id}/columns/{column_id}", response_model=Tab)
def update_column(
    sheet_id: str,
    tab_id: str,
    column_id: str,
    req: UpdateColumnRequest,
    current_user: str = Depends(get_current_user),
) -> Tab:
    if req.name is None and req.type is None:
        raise HTTPException(status_code=422, detail="No updatable fields provided")
    try:
        return service.update_column(
            current_user, sheet_id, tab_id, column_id, name=req.name, column_type=req.type
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/sheets/{sheet_id}/tabs/{tab_id}/columns/{column_id}", status_code=204)
def delete_column(
    sheet_id: str,
    tab_id: str,
    column_id: str,
    current_user: str = Depends(get_current_user),
) -> None:
    try:
        service.delete_column(current_user, sheet_id, tab_id, column_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/sheets/{sheet_id}/tabs", response_model=Tab)
def create_tab(
    sheet_id: str,
    req: CreateTabRequest,
    current_user: str = Depends(get_current_user),
) -> Tab:
    try:
        return service.create_tab(
            current_user,
            sheet_id,
            req.name,
            columns=req.columns,
            copy_columns_from=req.copy_columns_from,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/sheets/{sheet_id}/tabs/{tab_id}", response_model=Tab)
def update_tab(
    sheet_id: str,
    tab_id: str,
    req: UpdateTabRequest,
    current_user: str = Depends(get_current_user),
) -> Tab:
    if req.name is None and req.color is None and req.place_groups is None:
        raise HTTPException(status_code=422, detail="No updatable fields provided")
    try:
        return service.update_tab(
            current_user,
            sheet_id,
            tab_id,
            name=req.name,
            color=req.color,
            place_groups=req.place_groups,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/sheets/{sheet_id}/tabs/{tab_id}", status_code=204)
def delete_tab(
    sheet_id: str,
    tab_id: str,
    current_user: str = Depends(get_current_user),
) -> None:
    try:
        service.delete_tab(current_user, sheet_id, tab_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


# ── places (Story 4.1) ────────────────────────────────────────────────────────


@router.get("/maps-config", response_model=MapsConfig)
def maps_config(_: str = Depends(get_current_user)) -> MapsConfig:
    """Hand the SPA the browser key at runtime, so it is never built into the bundle."""
    if not places_service.maps_enabled():
        return MapsConfig(enabled=False)
    return MapsConfig(enabled=True, browser_key=places_service.browser_key())


@router.get("/places/search", response_model=list[PlaceResult])
def search_places(
    q: str = Query(...),
    near: str | None = Query(default=None),
    _: str = Depends(get_current_user),
) -> list[PlaceResult]:
    try:
        return places_service.search(q, near)
    except places_service.MapsNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except places_service.PlacesUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
