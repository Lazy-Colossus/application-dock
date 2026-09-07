from fastapi import Header, HTTPException

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
