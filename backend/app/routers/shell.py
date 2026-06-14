from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import update_service


class AppDescriptor(BaseModel):
    id: str
    label: str
    icon: str
    route: str


class UpdateStatus(BaseModel):
    available: bool


router = APIRouter(prefix="/api", tags=["shell"])


_APPS: list[AppDescriptor] = [
    AppDescriptor(
        id="archery",
        label="Archery Score Counterrr",
        icon="sports_score",
        route="/archery",
    ),
]


@router.get("/apps", response_model=list[AppDescriptor])
def list_apps() -> list[AppDescriptor]:
    return _APPS


@router.get("/shell/update-status", response_model=UpdateStatus)
def get_update_status() -> UpdateStatus:
    return UpdateStatus(available=update_service.is_update_available())


@router.post("/shell/update", status_code=202)
def trigger_update() -> dict[str, str]:
    try:
        update_service.trigger_update()
    except RuntimeError as exc:
        if str(exc) == "Update not available":
            raise HTTPException(status_code=503, detail="Update not available") from exc
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"detail": "Update started"}
