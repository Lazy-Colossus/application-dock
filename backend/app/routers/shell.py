from fastapi import APIRouter
from pydantic import BaseModel


class AppDescriptor(BaseModel):
    id: str
    label: str
    icon: str
    route: str


router = APIRouter(prefix="/api", tags=["shell"])


_APPS: list[AppDescriptor] = [
    AppDescriptor(
        id="archery",
        label="Archery Score Counter",
        icon="sports_score",
        route="/archery",
    ),
]


@router.get("/apps", response_model=list[AppDescriptor])
def list_apps() -> list[AppDescriptor]:
    return _APPS
