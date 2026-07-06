from fastapi import APIRouter, HTTPException

from app.schemas.hotaru import CreateWordRequest, HotaruUser, Word
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


@router.post("/words", response_model=Word, status_code=201)
def create_word(req: CreateWordRequest, user: str) -> Word:
    if user not in VALID_USER_IDS:
        raise HTTPException(status_code=404, detail=f"Unknown user {user}.")
    try:
        return hotaru_vocab_service.create_word(
            user=user,
            reading=req.reading,
            meaning=req.meaning,
            kanji=req.kanji,
            romaji=req.romaji,
            pos=req.pos,
            source=req.source,
            lesson=req.lesson,
            visibility=req.visibility,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
