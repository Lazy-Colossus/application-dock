"""Floor Planner API.

Every route works on the caller's apartment, resolved by the service from the
authenticated username; no route takes an apartment id.

Exception mapping lives here and nowhere below: `StaleRevError → 409` (someone
wrote since the client's `base_rev` — it reloads), `ApartmentGoneError → 410`,
`FileNotFoundError → 404`, `PermissionError → 403`, `ValueError → 422`.
"""

from __future__ import annotations

from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.routing import APIRoute

from app.core.dependencies import get_current_user
from app.schemas.floor_planner import (
    AddMemberRequest,
    AddPiecesRequest,
    ApartmentView,
    LayoutNameRequest,
    PieceDraft,
    PlacementRequest,
    PlanWriteRequest,
    RevRequest,
)
from app.services import floor_planner_service as service


class _ApartmentRoute(APIRoute):
    """Maps the service's errors once, so no handler repeats the ladder."""

    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        handler = super().get_route_handler()

        async def guarded(request: Request) -> Response:
            try:
                return await handler(request)
            except service.StaleRevError as exc:
                raise HTTPException(status_code=409, detail=str(exc)) from exc
            except service.ApartmentGoneError as exc:
                raise HTTPException(
                    status_code=410, detail="Your apartment changed — reload"
                ) from exc
            except FileNotFoundError as exc:
                raise HTTPException(status_code=404, detail=str(exc)) from exc
            except PermissionError as exc:
                raise HTTPException(status_code=403, detail=str(exc)) from exc
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc

        return guarded


router = APIRouter(prefix="/api/floor-planner", tags=["floor-planner"], route_class=_ApartmentRoute)


@router.get("/apartment", response_model=ApartmentView)
def get_apartment(current_user: str = Depends(get_current_user)) -> ApartmentView:
    return service.get_apartment(current_user)


@router.post("/apartment/lock", response_model=ApartmentView)
def lock(req: RevRequest, current_user: str = Depends(get_current_user)) -> ApartmentView:
    return service.set_locked(current_user, req.base_rev, True)


@router.post("/apartment/unlock", response_model=ApartmentView)
def unlock(req: RevRequest, current_user: str = Depends(get_current_user)) -> ApartmentView:
    return service.set_locked(current_user, req.base_rev, False)


@router.put("/apartment/plan", response_model=ApartmentView)
def replace_plan(
    req: PlanWriteRequest, current_user: str = Depends(get_current_user)
) -> ApartmentView:
    return service.replace_plan(current_user, req)


@router.post("/apartment/furniture", response_model=ApartmentView)
def add_pieces(
    req: AddPiecesRequest, current_user: str = Depends(get_current_user)
) -> ApartmentView:
    return service.add_pieces(current_user, req.pieces)


@router.put("/apartment/furniture/{piece_id}", response_model=ApartmentView)
def update_piece(
    piece_id: str, req: PieceDraft, current_user: str = Depends(get_current_user)
) -> ApartmentView:
    return service.update_piece(current_user, piece_id, req)


@router.delete("/apartment/furniture/{piece_id}", response_model=ApartmentView)
def delete_piece(piece_id: str, current_user: str = Depends(get_current_user)) -> ApartmentView:
    return service.delete_piece(current_user, piece_id)


@router.post("/apartment/layouts", response_model=ApartmentView)
def create_layout(
    req: LayoutNameRequest, current_user: str = Depends(get_current_user)
) -> ApartmentView:
    return service.create_layout(current_user, req.name)


@router.put("/apartment/layouts/{layout_id}", response_model=ApartmentView)
def rename_layout(
    layout_id: str, req: LayoutNameRequest, current_user: str = Depends(get_current_user)
) -> ApartmentView:
    return service.rename_layout(current_user, layout_id, req.name)


@router.post("/apartment/layouts/{layout_id}/duplicate", response_model=ApartmentView)
def duplicate_layout(
    layout_id: str, current_user: str = Depends(get_current_user)
) -> ApartmentView:
    return service.duplicate_layout(current_user, layout_id)


@router.delete("/apartment/layouts/{layout_id}", response_model=ApartmentView)
def delete_layout(layout_id: str, current_user: str = Depends(get_current_user)) -> ApartmentView:
    return service.delete_layout(current_user, layout_id)


@router.put("/apartment/layouts/{layout_id}/placements/{piece_id}", response_model=ApartmentView)
def place_piece(
    layout_id: str,
    piece_id: str,
    req: PlacementRequest,
    current_user: str = Depends(get_current_user),
) -> ApartmentView:
    return service.place_piece(current_user, layout_id, piece_id, req)


@router.delete("/apartment/layouts/{layout_id}/placements/{piece_id}", response_model=ApartmentView)
def remove_placement(
    layout_id: str, piece_id: str, current_user: str = Depends(get_current_user)
) -> ApartmentView:
    return service.remove_placement(current_user, layout_id, piece_id)


@router.post("/apartment/members", response_model=ApartmentView)
def add_member(
    req: AddMemberRequest, current_user: str = Depends(get_current_user)
) -> ApartmentView:
    return service.add_member(current_user, req.username)


@router.delete("/apartment/members/{username}", response_model=ApartmentView)
def remove_member(username: str, current_user: str = Depends(get_current_user)) -> ApartmentView:
    return service.remove_member(current_user, username)
