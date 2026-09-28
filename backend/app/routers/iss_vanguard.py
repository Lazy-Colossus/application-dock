"""ISS Vanguard resource tracker API.

Every route works on the caller's ship, resolved by the service from the
authenticated username; no route takes a ship id.

Exception mapping lives here and nowhere below: `FileNotFoundError → 404`,
`PermissionError → 403`, `ValueError → 422`, `ShipGoneError → 410` (the ship
vanished under a concurrent membership change — the client reloads).
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator, Awaitable, Callable, Coroutine
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse
from fastapi.routing import APIRoute

from app.core.dependencies import get_current_user, user_from_token
from app.schemas.iss_vanguard import (
    AddMemberRequest,
    ProjectWriteRequest,
    ShipView,
    StockAdjustRequest,
)
from app.services import iss_vanguard_events as events
from app.services import iss_vanguard_service as service


class _ShipRoute(APIRoute):
    """Maps the service's stdlib errors once, so no handler repeats the ladder."""

    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        handler = super().get_route_handler()

        async def guarded(request: Request) -> Response:
            try:
                return await handler(request)
            except service.ShipGoneError as exc:
                raise HTTPException(status_code=410, detail="Your ship changed — reload") from exc
            except FileNotFoundError as exc:
                raise HTTPException(status_code=404, detail=str(exc)) from exc
            except PermissionError as exc:
                raise HTTPException(status_code=403, detail=str(exc)) from exc
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc

        return guarded


router = APIRouter(prefix="/api/iss-vanguard", tags=["iss-vanguard"], route_class=_ShipRoute)


@router.get("/ship", response_model=ShipView)
def get_ship(current_user: str = Depends(get_current_user)) -> ShipView:
    return service.get_ship(current_user)


@router.post("/ship/stock", response_model=ShipView)
def adjust_stock(
    req: StockAdjustRequest, current_user: str = Depends(get_current_user)
) -> ShipView:
    return service.adjust_stock(current_user, req.resource, req.tier, req.delta)


@router.post("/ship/projects", response_model=ShipView)
def create_project(
    req: ProjectWriteRequest, current_user: str = Depends(get_current_user)
) -> ShipView:
    return service.create_project(current_user, req)


@router.put("/ship/projects/{project_id}", response_model=ShipView)
def update_project(
    project_id: str, req: ProjectWriteRequest, current_user: str = Depends(get_current_user)
) -> ShipView:
    return service.update_project(current_user, project_id, req)


@router.delete("/ship/projects/{project_id}", response_model=ShipView)
def delete_project(project_id: str, current_user: str = Depends(get_current_user)) -> ShipView:
    return service.delete_project(current_user, project_id)


@router.post("/ship/projects/{project_id}/complete", response_model=ShipView)
def complete_project(project_id: str, current_user: str = Depends(get_current_user)) -> ShipView:
    return service.complete_project(current_user, project_id)


@router.post("/ship/projects/{project_id}/reopen", response_model=ShipView)
def reopen_project(project_id: str, current_user: str = Depends(get_current_user)) -> ShipView:
    return service.reopen_project(current_user, project_id)


@router.post("/ship/members", response_model=ShipView)
def add_member(req: AddMemberRequest, current_user: str = Depends(get_current_user)) -> ShipView:
    return service.add_member(current_user, req.username)


@router.delete("/ship/members/{username}", response_model=ShipView)
def remove_member(username: str, current_user: str = Depends(get_current_user)) -> ShipView:
    return service.remove_member(current_user, username)


_KEEPALIVE_SECONDS = 15


async def sse_frames(
    ship_id: str,
    queue: asyncio.Queue[dict[str, Any]],
    is_disconnected: Callable[[], Awaitable[bool]],
    keepalive: float = _KEEPALIVE_SECONDS,
) -> AsyncIterator[str]:
    """Format a subscriber's queue as SSE frames until disconnect; always unsubscribes."""
    try:
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
            if events.is_stale(ship_id, queue):
                # Overflowed and missed events: drop it; it resyncs on reconnect by `rev`.
                break
    finally:
        events.unsubscribe(ship_id, queue)


@router.get("/ship/events")
async def ship_events(request: Request, token: str = Query(...)) -> StreamingResponse:
    """SSE stream for the caller's ship, authenticated via `?token=`.

    An `EventSource` cannot send an `Authorization` header. The ship is created
    if the caller has none, so a brand-new user still has a stream to hear a
    `ship.closed {reason: "joined"}` on.
    """
    username = user_from_token(token)
    ship_id = service.ensure_ship(username)
    queue = events.subscribe(ship_id)
    return StreamingResponse(
        sse_frames(ship_id, queue, request.is_disconnected),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
