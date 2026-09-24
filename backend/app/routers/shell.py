from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.dependencies import get_current_user
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
        label="Archery Score Counter",
        # Thematic monochrome target reticle, matching the shell registry
        # (Story 9.2). This list must agree with frontend/src/apps/registry.ts
        # — test_app_registry_parity.py enforces that.
        icon="adjust",
        route="/archery",
    ),
    AppDescriptor(
        id="hotaru",
        label="Hotaru",
        icon="school",
        route="/hotaru",
    ),
    AppDescriptor(
        id="context-switch",
        label="Context-Switch",
        icon="swap_horiz",
        route="/context-switch",
    ),
    AppDescriptor(
        id="listies",
        label="Listies",
        icon="table_chart",
        route="/listies",
    ),
    AppDescriptor(
        id="kalendariq",
        label="Kalendariq",
        icon="event_available",
        route="/kalendariq",
    ),
    AppDescriptor(
        id="kitchencraft",
        label="KitchenCraft",
        icon="menu_book",
        route="/kitchencraft",
    ),
    AppDescriptor(
        id="question-of-the-day",
        label="Question of the Day",
        icon="help_center",
        route="/question-of-the-day",
    ),
    AppDescriptor(
        id="shared-notes",
        label="Shared Notes",
        icon="sticky_note_2",
        route="/shared-notes",
    ),
    AppDescriptor(
        id="tea",
        label="Tea Cabinet",
        icon="emoji_food_beverage",
        route="/tea",
    ),
]


@router.get("/apps", response_model=list[AppDescriptor])
def list_apps(_: str = Depends(get_current_user)) -> list[AppDescriptor]:
    return _APPS


@router.get("/shell/update-status", response_model=UpdateStatus)
def get_update_status(_: str = Depends(get_current_user)) -> UpdateStatus:
    return UpdateStatus(available=update_service.is_update_available())


@router.post("/shell/update", status_code=202)
def trigger_update(_: str = Depends(get_current_user)) -> dict[str, str]:
    try:
        update_service.trigger_update()
    except update_service.UpdateUnavailableError as exc:
        raise HTTPException(status_code=503, detail="Update not available") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"detail": "Update started"}
