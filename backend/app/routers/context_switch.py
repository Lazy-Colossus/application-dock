"""Context-Switch API router.

Per-user todo boards. Every route is scoped to the authenticated user via
`get_current_user`; the username selects the on-disk file (never taken from
request input).
"""

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_user
from app.schemas.context_switch import (
    CreateListRequest,
    CreateTodoRequest,
    ListSummary,
    Todo,
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


@router.get("/lists/{list_id}", response_model=TodoList)
def get_list(list_id: str, current_user: str = Depends(get_current_user)) -> TodoList:
    try:
        return service.get_list(current_user, list_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="List not found") from exc


@router.put("/lists/{list_id}", response_model=TodoList)
def update_list(
    list_id: str,
    req: UpdateListRequest,
    current_user: str = Depends(get_current_user),
) -> TodoList:
    # PUT (not PATCH) to match the frontend `useApi` boundary, which exposes
    # get/post/put/del only — consistent with Hotaru's partial-update endpoint.
    if req.name is None and req.grid is None:
        raise HTTPException(status_code=422, detail="No updatable fields provided")
    try:
        return service.update_list(current_user, list_id, name=req.name, grid=req.grid)
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


@router.post("/lists/{list_id}/todos", response_model=Todo)
def add_todo(
    list_id: str,
    req: CreateTodoRequest,
    current_user: str = Depends(get_current_user),
) -> Todo:
    try:
        return service.add_todo(current_user, list_id, req.header, req.body, req.color)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="List not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
