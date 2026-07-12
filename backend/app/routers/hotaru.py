from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_user
from app.schemas.hotaru import (
    CreateTopicRequest,
    CreateWordRequest,
    DrillCap,
    GradeItem,
    HotaruUser,
    PracticeOverview,
    ProgressEntry,
    QueueItem,
    Topic,
    UpdateWordRequest,
    Word,
)
from app.services import hotaru_practice_service, hotaru_vocab_service

# Every Hotaru endpoint sits behind a valid login (like archery/shell). The
# per-learner `user=dani|jake` query param is a separate, in-app concept.
router = APIRouter(
    prefix="/api/hotaru",
    tags=["hotaru"],
    dependencies=[Depends(get_current_user)],
)

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
def list_words(
    lesson: str | None = None,
    user: str | None = None,
    topic: str | None = None,
) -> list[Word]:
    if user is not None and user not in VALID_USER_IDS:
        raise HTTPException(status_code=404, detail=f"Unknown user {user}.")
    return hotaru_vocab_service.list_words(lesson=lesson, user=user, topic=topic)


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


@router.put("/words/{word_id}", response_model=Word)
def update_word(word_id: str, req: UpdateWordRequest, user: str) -> Word:
    if user not in VALID_USER_IDS:
        raise HTTPException(status_code=404, detail=f"Unknown user {user}.")
    try:
        return hotaru_vocab_service.update_word(
            user=user,
            word_id=word_id,
            reading=req.reading,
            meaning=req.meaning,
            kanji=req.kanji,
            romaji=req.romaji,
            pos=req.pos,
            lesson=req.lesson,
            visibility=req.visibility,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Word {word_id} not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/words/{word_id}", status_code=204)
def delete_word(word_id: str, user: str) -> None:
    if user not in VALID_USER_IDS:
        raise HTTPException(status_code=404, detail=f"Unknown user {user}.")
    try:
        hotaru_vocab_service.delete_word(user=user, word_id=word_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Word {word_id} not found.") from exc


@router.get("/topics", response_model=list[Topic])
def list_topics() -> list[Topic]:
    return hotaru_vocab_service.list_topics()


@router.post("/topics", response_model=Topic, status_code=201)
def create_topic(req: CreateTopicRequest) -> Topic:
    try:
        return hotaru_vocab_service.create_topic(name=req.name)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/topics/{topic_id}/words/{word_id}", response_model=Topic)
def assign_word(topic_id: str, word_id: str, user: str) -> Topic:
    if user not in VALID_USER_IDS:
        raise HTTPException(status_code=404, detail=f"Unknown user {user}.")
    try:
        return hotaru_vocab_service.assign_word(topic_id=topic_id, word_id=word_id, user=user)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Not found: {exc}.") from exc


@router.delete("/topics/{topic_id}/words/{word_id}", status_code=204)
def unassign_word(topic_id: str, word_id: str, user: str) -> None:
    if user not in VALID_USER_IDS:
        raise HTTPException(status_code=404, detail=f"Unknown user {user}.")
    try:
        hotaru_vocab_service.unassign_word(topic_id=topic_id, word_id=word_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Not found: {exc}.") from exc


@router.get("/practice/overview", response_model=PracticeOverview)
def practice_overview(scope: str, user: str) -> PracticeOverview:
    if user not in VALID_USER_IDS:
        raise HTTPException(status_code=404, detail=f"Unknown user {user}.")
    try:
        return hotaru_practice_service.overview(scope=scope, user=user)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/practice/study", response_model=list[Word])
def practice_study(scope: str, user: str) -> list[Word]:
    if user not in VALID_USER_IDS:
        raise HTTPException(status_code=404, detail=f"Unknown user {user}.")
    try:
        return hotaru_practice_service.study_words(scope=scope, user=user)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/practice/familiarity", response_model=dict[str, int])
def practice_familiarity(user: str) -> dict[str, int]:
    if user not in VALID_USER_IDS:
        raise HTTPException(status_code=404, detail=f"Unknown user {user}.")
    return hotaru_practice_service.familiarity_map(user=user)


def _parse_tiers(raw: str) -> list[int]:
    """Parse a comma-separated tier list (Quick Practice). Raises ValueError on a
    non-integer or out-of-range (0–4) value, mapped to 422 by the caller."""
    tiers: list[int] = []
    for part in raw.split(","):
        try:
            tier = int(part)
        except ValueError as exc:
            raise ValueError(f"Invalid tier {part!r}.") from exc
        if not 0 <= tier <= 4:
            raise ValueError(f"Tier {tier} out of range 0-4.")
        tiers.append(tier)
    return tiers


@router.get("/practice/queue", response_model=list[QueueItem])
def practice_queue(
    scope: str,
    user: str,
    direction: DrillCap = "r2m",
    tiers: str | None = None,
    lessons: str | None = None,
    limit: int = hotaru_practice_service.DEFAULT_SESSION_SIZE,
) -> list[QueueItem]:
    if user not in VALID_USER_IDS:
        raise HTTPException(status_code=404, detail=f"Unknown user {user}.")
    try:
        return hotaru_practice_service.build_queue(
            scope=scope,
            user=user,
            direction=direction,
            limit=limit,
            lessons=lessons.split(",") if lessons else None,
            tiers=_parse_tiers(tiers) if tiers else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/practice/grades", response_model=dict[str, ProgressEntry])
def practice_grades(grades: list[GradeItem], user: str) -> dict[str, ProgressEntry]:
    if user not in VALID_USER_IDS:
        raise HTTPException(status_code=404, detail=f"Unknown user {user}.")
    return hotaru_practice_service.apply_grades(user=user, grades=grades)
