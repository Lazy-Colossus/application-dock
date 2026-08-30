"""Listies API router.

Per-user sheets of typed columns. Every route is scoped to the authenticated
user via `get_current_user`; the username selects the on-disk file (never taken
from request input).
"""

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_user
from app.schemas.listies import CreateSheetRequest, Sheet, SheetSummary
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
