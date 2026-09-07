"""Question of the Day API router.

One shared question a day for the whole dock; every logged-in user answers it
under their own name and, once they have, sees everyone else's answers (Epic 3).
Unlike archery/shell this app *uses* the authenticated username to attribute
answers, so routes take `current_user` rather than discarding it.

Auth is applied at the router level, so every route mounted here — now and in
later stories — sits behind `get_current_user` by construction. HTTP only: this
is the one layer that raises `HTTPException`; the service raises stdlib
exceptions and knows nothing about status codes.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_user
from app.schemas.qotd import (
    Answer,
    AnswerRequest,
    HistoryRow,
    PastDayView,
    TodayFeed,
    TodayView,
)
from app.services import qotd_service as service

router = APIRouter(
    prefix="/api/qotd",
    tags=["qotd"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/today", response_model=TodayView)
def get_today(current_user: str = Depends(get_current_user)) -> TodayView:
    """Today's question, its date, and whether the caller has already answered.

    Never returns other users' answers — the feed is gated behind
    answer-to-reveal (Epic 3).
    """
    try:
        return service.today_view(current_user)
    except KeyError as exc:
        # A stored/selected question id no longer in the set — a broken set, not
        # bad input. Surface it loudly as a server error (Story 1.2 AC-5).
        raise HTTPException(status_code=500, detail="Today's question is unavailable") from exc


@router.put("/today/answer", response_model=Answer)
def put_today_answer(req: AnswerRequest, current_user: str = Depends(get_current_user)) -> Answer:
    """Record the caller's answer to today's question (upsert).

    Attribution is the JWT username; any user field in the body is ignored.
    """
    try:
        return service.upsert_today_answer(current_user, text=req.text, rating=req.rating)
    except PermissionError as exc:
        # A write aimed at a day that has passed — refused server-side even if
        # the UI is bypassed (Story 2.3, FR-9).
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=500, detail="Today's question is unavailable") from exc


@router.get("/today/answers", response_model=TodayFeed)
def get_today_answers(current_user: str = Depends(get_current_user)) -> TodayFeed:
    """Today's feed, gated: withheld until the caller has answered (FR-10).

    "Has answered" is derived server-side from the stored day, so an un-answered
    caller cannot obtain the contents by calling this directly.
    """
    return service.today_feed(current_user)


@router.get("/history", response_model=list[HistoryRow])
def get_history(_: str = Depends(get_current_user)) -> list[HistoryRow]:
    """Past days newest-first, each with its resolved question text and type."""
    try:
        return service.history()
    except KeyError as exc:
        raise HTTPException(status_code=500, detail="A past question is unavailable") from exc


@router.get("/days/{date}", response_model=PastDayView)
def get_past_day(date: str, _: str = Depends(get_current_user)) -> PastDayView:
    """A past day's question and all its answers, read-only and always visible.

    Past only: today/future is refused (today lives on the `/today` flow, which
    carries the reveal gate). Malformed → 400; unknown past date → 404.
    """
    try:
        return service.past_day_view(date)
    except PermissionError as exc:
        # Today/future is not served here; a 404 keeps this endpoint's surface to
        # the past and does not confirm whether such a day exists.
        raise HTTPException(status_code=404, detail="That day is not available") from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Day not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=500, detail="That day's question is unavailable") from exc
