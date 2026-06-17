"""Authentication business logic: password verification and JWT management."""

from __future__ import annotations

import warnings
from datetime import UTC, datetime, timedelta

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings
from app.repositories import auth_repo


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_login(username: str, password: str) -> bool:
    """Return True if username and password match the stored credentials."""
    record = auth_repo.read_user()
    if record is None:
        return False
    if record.username != username:
        return False
    return bcrypt.checkpw(password.encode(), record.password_hash.encode())


def create_access_token(username: str) -> str:
    """Return a signed JWT for the given username."""
    if not settings.jwt_secret_key:
        warnings.warn(
            "JWT_SECRET_KEY is not set — tokens are insecure. Set it in production.",
            stacklevel=2,
        )
    expire = datetime.now(UTC) + timedelta(days=settings.jwt_expire_days)
    payload = {"sub": username, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> str:
    """Decode a JWT and return the username, or raise ValueError if invalid/expired."""
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise ValueError("Invalid or expired token") from exc
    username: str | None = payload.get("sub")
    if not username:
        raise ValueError("Token missing subject claim")
    return username
