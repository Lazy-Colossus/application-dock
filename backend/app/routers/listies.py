"""Listies API router.

Per-user sheets of typed columns. Every route is scoped to the authenticated
user via `get_current_user`; the username selects the on-disk file (never taken
from request input).
"""

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_user
from app.schemas.listies import (
    CreateRowRequest,
    CreateSheetRequest,
    Row,
    Sheet,
    SheetSummary,
    UpdateRowRequest,
    UpdateSheetRequest,
)
from app.services import listies_service as service

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


@router.put("/sheets/{sheet_id}", response_model=Sheet)
def update_sheet(
    sheet_id: str,
    req: UpdateSheetRequest,
    current_user: str = Depends(get_current_user),
) -> Sheet:
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


@router.get("/sheets/{sheet_id}", response_model=Sheet)
def get_sheet(sheet_id: str, current_user: str = Depends(get_current_user)) -> Sheet:
    try:
        return service.get_sheet(current_user, sheet_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Sheet not found") from exc


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
