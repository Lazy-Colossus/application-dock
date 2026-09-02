"""KDH API router.

Shared availability calendars. Unlike the other apps in this dock, KDH's data is
**not** scoped per user: the group votes behind one shared login, so calendars
are global to the deployment and a file is selected by calendar id, never by
username. The authenticated username decides only what the caller may *do* —
guests vote, everyone else administers (see `kdh_service.is_admin`).

HTTP only. This is the one layer that raises `HTTPException`; the service raises
stdlib exceptions and knows nothing about status codes.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_user
from app.schemas.kdh import (
    AddInviteeRequest,
    Calendar,
    CalendarSummary,
    CreateCalendarRequest,
    Me,
    UpdateCalendarRequest,
)
from app.services import kdh_service as service

router = APIRouter(prefix="/api/kdh", tags=["kdh"])


@router.get("/me", response_model=Me)
def get_me(current_user: str = Depends(get_current_user)) -> Me:
    """Who the caller is and whether they may administer.

    The frontend uses this to hide admin controls rather than render them and
    let them fail; the `403` below is what actually enforces it.
    """
    return Me(username=current_user, is_admin=service.is_admin(current_user))


@router.get("/calendars", response_model=list[CalendarSummary])
def list_calendars(_: str = Depends(get_current_user)) -> list[CalendarSummary]:
    return service.list_calendar_summaries()


@router.post("/calendars", response_model=Calendar, status_code=201)
def create_calendar(
    req: CreateCalendarRequest,
    current_user: str = Depends(get_current_user),
) -> Calendar:
    try:
        return service.create_calendar(current_user, req.name, req.invitee_names)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/calendars/{calendar_id}", response_model=Calendar)
def get_calendar(calendar_id: str, _: str = Depends(get_current_user)) -> Calendar:
    try:
        return service.get_calendar(calendar_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Calendar not found") from exc
    except ValueError as exc:
        # A malformed id (path separator, `..`) is bad input, not a missing file.
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/calendars/{calendar_id}", response_model=Calendar)
def rename_calendar(
    calendar_id: str,
    req: UpdateCalendarRequest,
    current_user: str = Depends(get_current_user),
) -> Calendar:
    try:
        return service.rename_calendar(current_user, calendar_id, req.name)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Calendar not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/calendars/{calendar_id}", status_code=204)
def delete_calendar(calendar_id: str, current_user: str = Depends(get_current_user)) -> None:
    try:
        service.delete_calendar(current_user, calendar_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Calendar not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/calendars/{calendar_id}/invitees", response_model=Calendar, status_code=201)
def add_invitee(
    calendar_id: str,
    req: AddInviteeRequest,
    current_user: str = Depends(get_current_user),
) -> Calendar:
    try:
        return service.add_invitee(current_user, calendar_id, req.name)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Calendar not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
