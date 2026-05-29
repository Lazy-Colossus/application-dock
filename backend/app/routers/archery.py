from fastapi import APIRouter, HTTPException, Path

from app.schemas.session import CreateSessionRequest, SessionData, SessionSummary
from app.services import archery_service

router = APIRouter(prefix="/api/archery", tags=["archery"])

_LABEL_PATTERN = r"^\d{4}-\d{2}-\d{2}(-\d+)?$"


@router.post("/sessions", response_model=SessionData)
def create_session(req: CreateSessionRequest) -> SessionData:
    try:
        return archery_service.create_session(req.archers)
    except RuntimeError as exc:
        if "already in progress" in str(exc):
            raise HTTPException(
                status_code=409, detail="A session is already in progress."
            ) from exc
        raise


@router.get("/sessions", response_model=list[SessionSummary])
def list_sessions() -> list[SessionSummary]:
    return archery_service.list_history()


@router.get("/sessions/in-progress", response_model=SessionData)
def get_in_progress() -> SessionData:
    s = archery_service.get_in_progress()
    if s is None:
        raise HTTPException(status_code=404, detail="No session in progress.")
    return s


@router.delete("/sessions/in-progress", status_code=204)
def delete_in_progress() -> None:
    archery_service.discard_in_progress()


@router.put("/sessions/in-progress", response_model=SessionData)
def update_in_progress(body: SessionData) -> SessionData:
    try:
        return archery_service.update_in_progress(body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="No session in progress.") from exc


@router.post("/sessions/in-progress/finalise", response_model=SessionData)
def finalise_session() -> SessionData:
    try:
        return archery_service.finalise_in_progress()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="No session in progress.") from exc


@router.get("/sessions/{label}", response_model=SessionData)
def get_session(label: str = Path(..., pattern=_LABEL_PATTERN)) -> SessionData:
    try:
        return archery_service.read_finalised(label)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Session {label} not found.") from exc
