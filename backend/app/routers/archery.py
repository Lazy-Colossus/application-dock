from fastapi import APIRouter, HTTPException, Path

from app.schemas.session import (
    CreateSessionRequest,
    InProgressSummary,
    SessionData,
    SessionSummary,
)
from app.services import archery_service

router = APIRouter(prefix="/api/archery", tags=["archery"])

_LABEL_PATTERN = r"^\d{4}-\d{2}-\d{2}(-\d+)?$"


@router.post("/sessions", response_model=SessionData)
def create_session(req: CreateSessionRequest) -> SessionData:
    return archery_service.create_session(req.archers, req.name)


@router.get("/sessions", response_model=list[SessionSummary])
def list_sessions() -> list[SessionSummary]:
    return archery_service.list_history()


@router.get("/sessions/in-progress", response_model=list[InProgressSummary])
def list_in_progress() -> list[InProgressSummary]:
    return archery_service.list_in_progress_summaries()


@router.get("/sessions/in-progress/{label}", response_model=SessionData)
def get_in_progress(label: str = Path(..., pattern=_LABEL_PATTERN)) -> SessionData:
    s = archery_service.get_in_progress(label)
    if s is None:
        raise HTTPException(status_code=404, detail=f"No in-progress session {label}.")
    return s


@router.put("/sessions/in-progress/{label}", response_model=SessionData)
def update_in_progress(
    body: SessionData, label: str = Path(..., pattern=_LABEL_PATTERN)
) -> SessionData:
    if body.label != label:
        raise HTTPException(status_code=400, detail="Path label does not match body label.")
    try:
        return archery_service.update_in_progress(body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"No in-progress session {label}.") from exc


@router.delete("/sessions/in-progress/{label}", status_code=204)
def delete_in_progress(label: str = Path(..., pattern=_LABEL_PATTERN)) -> None:
    archery_service.discard_in_progress(label)


@router.post("/sessions/in-progress/{label}/finalise", response_model=SessionData)
def finalise_session(label: str = Path(..., pattern=_LABEL_PATTERN)) -> SessionData:
    try:
        return archery_service.finalise_in_progress(label)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"No in-progress session {label}.") from exc


@router.get("/sessions/{label}", response_model=SessionData)
def get_session(label: str = Path(..., pattern=_LABEL_PATTERN)) -> SessionData:
    try:
        return archery_service.read_finalised(label)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Session {label} not found.") from exc
