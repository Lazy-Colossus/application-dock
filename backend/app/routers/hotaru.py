from fastapi import APIRouter

from app.schemas.hotaru import HotaruUser

router = APIRouter(prefix="/api/hotaru", tags=["hotaru"])

# The two canonical, hardcoded users (no auth — household app). This is the single
# source of truth: the frontend renders identity from it, and later stories validate
# the `user` query param on user-scoped endpoints against these ids.
_USERS: list[HotaruUser] = [
    HotaruUser(id="dani", name="Dani"),
    HotaruUser(id="jake", name="Jake"),
]

VALID_USER_IDS: frozenset[str] = frozenset(u.id for u in _USERS)


@router.get("/users", response_model=list[HotaruUser])
def list_users() -> list[HotaruUser]:
    return _USERS
