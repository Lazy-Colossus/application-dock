from collections.abc import Callable

from fastapi import Depends, Header, HTTPException, Query

from app.core.config import settings
from app.services import auth_service


def user_from_token(token: str) -> str:
    """Decode a JWT to a username, or raise 401.

    Shared by the bearer-header dependency and the SSE `?token=` query param
    (an `EventSource` cannot send an `Authorization` header, Story 5.2), so both
    paths run the exact same verification.
    """
    try:
        return auth_service.decode_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Not authenticated") from exc


def get_current_user(authorization: str | None = Header(None)) -> str:
    """FastAPI dependency — extracts and validates the Bearer token.

    Returns the username on success; raises 401 on missing or invalid token.
    """
    if authorization is None or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user_from_token(authorization.removeprefix("Bearer "))


def can_use(username: str, app_id: str) -> bool:
    allowed = settings.app_access_by_user.get(username)
    return allowed is None or app_id in allowed


def any_user(
    authorization: str | None = Header(None),
    token: str | None = Query(None, include_in_schema=False),
) -> str:
    """The caller, from the bearer header or, for SSE streams and image URLs
    that can't send one, the `?token=` query param those endpoints already take."""
    if authorization is not None and authorization.startswith("Bearer "):
        return user_from_token(authorization.removeprefix("Bearer "))
    if token is not None:
        return user_from_token(token)
    raise HTTPException(status_code=401, detail="Not authenticated")


def require_app(app_id: str) -> Callable[..., str]:
    """Router dependency: the caller must be allowed `app_id`, or it's a 403."""

    def check(username: str = Depends(any_user)) -> str:
        if not can_use(username, app_id):
            raise HTTPException(status_code=403, detail="You don't have access to this app")
        return username

    return check
