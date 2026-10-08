"""Floor Planner API.

Every apartment route takes the apartment id; the service refuses (404) unless
the authenticated user is a member.

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
    ApartmentNameRequest,
    ApartmentSummary,
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
                    status_code=410, detail="This apartment changed — reload"
                ) from exc
            except FileNotFoundError as exc:
                raise HTTPException(status_code=404, detail=str(exc)) from exc
            except PermissionError as exc:
                raise HTTPException(status_code=403, detail=str(exc)) from exc
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc

        return guarded


router = APIRouter(prefix="/api/floor-planner", tags=["floor-planner"], route_class=_ApartmentRoute)


A = "/apartments/{apartment_id}"


@router.get("/apartments", response_model=list[ApartmentSummary])
def list_apartments(current_user: str = Depends(get_current_user)) -> list[ApartmentSummary]:
    return service.list_apartments(current_user)


@router.post("/apartments", response_model=ApartmentView, status_code=201)
def create_apartment(
    req: ApartmentNameRequest, current_user: str = Depends(get_current_user)
) -> ApartmentView:
    return service.create_apartment(current_user, req.name)


@router.get(A, response_model=ApartmentView)
def get_apartment(
    apartment_id: str, current_user: str = Depends(get_current_user)
) -> ApartmentView:
    return service.get_apartment(current_user, apartment_id)


@router.put(f"{A}/name", response_model=ApartmentView)
def rename_apartment(
    apartment_id: str, req: ApartmentNameRequest, current_user: str = Depends(get_current_user)
) -> ApartmentView:
    return service.rename_apartment(current_user, apartment_id, req.name)


@router.post(f"{A}/duplicate", response_model=ApartmentView, status_code=201)
def duplicate_apartment(
    apartment_id: str, req: ApartmentNameRequest, current_user: str = Depends(get_current_user)
) -> ApartmentView:
    return service.duplicate_apartment(current_user, apartment_id, req.name)


@router.delete(A, response_model=list[ApartmentSummary])
def delete_apartment(
    apartment_id: str, current_user: str = Depends(get_current_user)
) -> list[ApartmentSummary]:
    return service.delete_apartment(current_user, apartment_id)


@router.post(f"{A}/lock", response_model=ApartmentView)
def lock(
    apartment_id: str, req: RevRequest, current_user: str = Depends(get_current_user)
) -> ApartmentView:
    return service.set_locked(current_user, apartment_id, req.base_rev, True)


@router.post(f"{A}/unlock", response_model=ApartmentView)
def unlock(
    apartment_id: str, req: RevRequest, current_user: str = Depends(get_current_user)
) -> ApartmentView:
    return service.set_locked(current_user, apartment_id, req.base_rev, False)


@router.put(f"{A}/plan", response_model=ApartmentView)
def replace_plan(
    apartment_id: str, req: PlanWriteRequest, current_user: str = Depends(get_current_user)
) -> ApartmentView:
    return service.replace_plan(current_user, apartment_id, req)


@router.post(f"{A}/furniture", response_model=ApartmentView)
def add_pieces(
    apartment_id: str, req: AddPiecesRequest, current_user: str = Depends(get_current_user)
) -> ApartmentView:
    return service.add_pieces(current_user, apartment_id, req.pieces)


@router.put(f"{A}/furniture/{{piece_id}}", response_model=ApartmentView)
def update_piece(
    apartment_id: str,
    piece_id: str,
    req: PieceDraft,
    current_user: str = Depends(get_current_user),
) -> ApartmentView:
    return service.update_piece(current_user, apartment_id, piece_id, req)


@router.delete(f"{A}/furniture/{{piece_id}}", response_model=ApartmentView)
def delete_piece(
    apartment_id: str, piece_id: str, current_user: str = Depends(get_current_user)
) -> ApartmentView:
    return service.delete_piece(current_user, apartment_id, piece_id)


@router.post(f"{A}/layouts", response_model=ApartmentView)
def create_layout(
    apartment_id: str, req: LayoutNameRequest, current_user: str = Depends(get_current_user)
) -> ApartmentView:
    return service.create_layout(current_user, apartment_id, req.name)


@router.put(f"{A}/layouts/{{layout_id}}", response_model=ApartmentView)
def rename_layout(
    apartment_id: str,
    layout_id: str,
    req: LayoutNameRequest,
    current_user: str = Depends(get_current_user),
) -> ApartmentView:
    return service.rename_layout(current_user, apartment_id, layout_id, req.name)


@router.post(f"{A}/layouts/{{layout_id}}/duplicate", response_model=ApartmentView)
def duplicate_layout(
    apartment_id: str, layout_id: str, current_user: str = Depends(get_current_user)
) -> ApartmentView:
    return service.duplicate_layout(current_user, apartment_id, layout_id)


@router.delete(f"{A}/layouts/{{layout_id}}", response_model=ApartmentView)
def delete_layout(
    apartment_id: str, layout_id: str, current_user: str = Depends(get_current_user)
) -> ApartmentView:
    return service.delete_layout(current_user, apartment_id, layout_id)


@router.put(f"{A}/layouts/{{layout_id}}/placements/{{piece_id}}", response_model=ApartmentView)
def place_piece(
    apartment_id: str,
    layout_id: str,
    piece_id: str,
    req: PlacementRequest,
    current_user: str = Depends(get_current_user),
) -> ApartmentView:
    return service.place_piece(current_user, apartment_id, layout_id, piece_id, req)


@router.delete(f"{A}/layouts/{{layout_id}}/placements/{{piece_id}}", response_model=ApartmentView)
def remove_placement(
    apartment_id: str,
    layout_id: str,
    piece_id: str,
    current_user: str = Depends(get_current_user),
) -> ApartmentView:
    return service.remove_placement(current_user, apartment_id, layout_id, piece_id)


@router.post(f"{A}/members", response_model=ApartmentView)
def add_member(
    apartment_id: str, req: AddMemberRequest, current_user: str = Depends(get_current_user)
) -> ApartmentView:
    return service.add_member(current_user, apartment_id, req.username)


@router.delete(f"{A}/members/{{username}}", response_model=ApartmentView)
def remove_member(
    apartment_id: str, username: str, current_user: str = Depends(get_current_user)
) -> ApartmentView:
    return service.remove_member(current_user, apartment_id, username)


@router.post(f"{A}/leave", response_model=list[ApartmentSummary])
def leave_apartment(
    apartment_id: str, current_user: str = Depends(get_current_user)
) -> list[ApartmentSummary]:
    return service.leave_apartment(current_user, apartment_id)
