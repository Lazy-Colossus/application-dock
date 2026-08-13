"""Context-Switch API router.

Per-user todo boards. Every route is scoped to the authenticated user via
`get_current_user`; the username selects the on-disk file (never taken from
request input).
"""

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_user
from app.schemas.context_switch import (
    CreateListRequest,
    ListSummary,
    TodoList,
    UpdateListRequest,
)
from app.services import context_switch_service as service

router = APIRouter(prefix="/api/context-switch", tags=["context-switch"])


@router.get("/lists", response_model=list[ListSummary])
def list_lists(current_user: str = Depends(get_current_user)) -> list[ListSummary]:
    return service.list_lists(current_user)


@router.post("/lists", response_model=TodoList)
def create_list(req: CreateListRequest, current_user: str = Depends(get_current_user)) -> TodoList:
    try:
        return service.create_list(current_user, req.name)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/lists/{list_id}", response_model=TodoList)
def update_list(
    list_id: str,
    req: UpdateListRequest,
    current_user: str = Depends(get_current_user),
) -> TodoList:
    # PUT (not PATCH) to match the frontend `useApi` boundary, which exposes
    # get/post/put/del only — consistent with Hotaru's partial-update endpoint.
    # Story 1.4 updates the name; `grid` joins this endpoint in Story 2.2.
    if req.name is None:
        raise HTTPException(status_code=422, detail="No updatable fields provided")
    try:
        return service.rename_list(current_user, list_id, req.name)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="List not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/lists/{list_id}", status_code=204)
def delete_list(list_id: str, current_user: str = Depends(get_current_user)) -> None:
    try:
        service.delete_list(current_user, list_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="List not found") from exc
