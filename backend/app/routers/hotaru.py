from fastapi import APIRouter, HTTPException

from app.schemas.hotaru import HotaruUser, Word
from app.services import hotaru_vocab_service

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


@router.get("/words", response_model=list[Word])
def list_words(lesson: str | None = None, user: str | None = None) -> list[Word]:
    if user is not None and user not in VALID_USER_IDS:
        raise HTTPException(status_code=404, detail=f"Unknown user {user}.")
    return hotaru_vocab_service.list_words(lesson=lesson, user=user)
