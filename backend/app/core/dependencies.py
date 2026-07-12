from fastapi import Header, HTTPException

from app.services import auth_service


def get_current_user(authorization: str | None = Header(None)) -> str:
    """FastAPI dependency — extracts and validates the Bearer token.

    Returns the username on success; raises 401 on missing or invalid token.
    """
    if authorization is None or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.removeprefix("Bearer ")
    try:
        return auth_service.decode_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Not authenticated") from exc
