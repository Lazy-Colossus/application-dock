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
    SetChosenRequest,
    SetNoteRequest,
    SetVoteRequest,
    SetVotesBulkRequest,
    SharedCalendar,
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
    return Me(
        username=current_user,
        is_admin=service.is_admin(current_user),
        today=service.today().isoformat(),
    )


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


@router.delete("/calendars/{calendar_id}/invitees/{invitee_id}", response_model=Calendar)
def remove_invitee(
    calendar_id: str,
    invitee_id: str,
    current_user: str = Depends(get_current_user),
) -> Calendar:
    try:
        return service.remove_invitee(current_user, calendar_id, invitee_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/calendars/{calendar_id}/votes", response_model=Calendar)
def set_vote(
    calendar_id: str,
    req: SetVoteRequest,
    _: str = Depends(get_current_user),
) -> Calendar:
    try:
        return service.set_vote(calendar_id, req.invitee_id, req.date, req.status)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/calendars/{calendar_id}/chosen", response_model=Calendar)
def set_chosen(
    calendar_id: str,
    req: SetChosenRequest,
    current_user: str = Depends(get_current_user),
) -> Calendar:
    try:
        return service.set_chosen(current_user, calendar_id, req.date, req.chosen)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Calendar not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/calendars/{calendar_id}/votes/bulk", response_model=Calendar)
def set_votes_bulk(
    calendar_id: str,
    req: SetVotesBulkRequest,
    _: str = Depends(get_current_user),
) -> Calendar:
    try:
        return service.set_votes_bulk(
            calendar_id, req.invitee_id, req.dates, req.status, req.clear_notes
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/calendars/{calendar_id}/notes", response_model=Calendar)
def set_note(
    calendar_id: str,
    req: SetNoteRequest,
    _: str = Depends(get_current_user),
) -> Calendar:
    try:
        return service.set_note(calendar_id, req.invitee_id, req.date, req.text)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


# ── The invitee link ─────────────────────────────────────────────────────────
#
# Everything below is UNAUTHENTICATED, deliberately: an invitee follows a link
# out of a group chat and has no account here. The token in the path is the
# whole of the authorisation, so these routes are written to a rule —
#
#   the token buys exactly the four verbs an invitee needs, on the one calendar
#   it names, and nothing else.
#
# Renaming, deleting, the roster and the chosen day are absent from this router
# rather than guarded inside it. A route that is not written cannot be reached
# by a bug in a guard, and the shape of the file is then the security argument.
#
# An unknown or stale token is a 404 with no detail — the same answer as a
# calendar that never existed — so probing cannot tell the two apart.


share_router = APIRouter(prefix="/api/kdh/share", tags=["kdh-share"])


def _shared(token: str) -> Calendar:
    try:
        return service.get_shared_calendar(token)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Not found") from exc


@share_router.get("/{token}", response_model=SharedCalendar)
def get_shared(token: str) -> SharedCalendar:
    return SharedCalendar(calendar=_shared(token), today=service.today().isoformat())


@share_router.put("/{token}/votes", response_model=Calendar)
def set_shared_vote(token: str, req: SetVoteRequest) -> Calendar:
    calendar = _shared(token)
    try:
        return service.set_vote(calendar.id, req.invitee_id, req.date, req.status)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@share_router.put("/{token}/votes/bulk", response_model=Calendar)
def set_shared_votes_bulk(token: str, req: SetVotesBulkRequest) -> Calendar:
    calendar = _shared(token)
    try:
        return service.set_votes_bulk(
            calendar.id, req.invitee_id, req.dates, req.status, req.clear_notes
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@share_router.put("/{token}/notes", response_model=Calendar)
def set_shared_note(token: str, req: SetNoteRequest) -> Calendar:
    calendar = _shared(token)
    try:
        return service.set_note(calendar.id, req.invitee_id, req.date, req.text)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
