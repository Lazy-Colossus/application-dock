"""Authentication business logic: password verification and JWT management."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings
from app.repositories import auth_repo

_TMP_PASSWORD = "tmp123"


class UserAlreadyExistsError(ValueError):
    pass


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def list_usernames() -> list[str]:
    """Return all usernames sorted alphabetically."""
    return sorted(r.username for r in auth_repo.read_users())


def create_user(username: str) -> None:
    """Create a new user with the temporary password. Raises ValueError on validation failure."""
    username = username.strip()
    if not username:
        raise ValueError("Username cannot be empty")
    record = auth_repo.UserRecord(
        username=username,
        password_hash=hash_password(_TMP_PASSWORD),
    )
    if not auth_repo.add_user_if_not_exists(record):
        raise UserAlreadyExistsError("Username already exists")


def change_password(username: str, current_password: str, new_password: str) -> None:
    """Update the stored password hash. Raises ValueError on auth failure."""
    record = auth_repo.read_user(username)
    if record is None:
        raise ValueError("User not found")
    if not bcrypt.checkpw(current_password.encode(), record.password_hash.encode()):
        raise ValueError("Current password is incorrect")
    auth_repo.write_user(
        auth_repo.UserRecord(username=username, password_hash=hash_password(new_password))
    )


def verify_login(username: str, password: str) -> bool:
    """Return True if username and password match the stored credentials."""
    record = auth_repo.read_user(username)
    if record is None:
        return False
    return bcrypt.checkpw(password.encode(), record.password_hash.encode())


def create_access_token(username: str) -> str:
    """Return a signed JWT for the given username."""
    if not settings.jwt_secret_key:
        raise RuntimeError("JWT_SECRET_KEY is not configured. Set it before issuing tokens.")
    expire = datetime.now(UTC) + timedelta(days=settings.jwt_expire_days)
    payload = {"sub": username, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> str:
    """Decode a JWT and return the username, or raise ValueError if invalid/expired."""
    if not settings.jwt_secret_key:
        # Misconfiguration — not a token error; let FastAPI's default handler return 500.
        raise RuntimeError("JWT_SECRET_KEY is not configured")
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise ValueError("Invalid or expired token") from exc
    username: str | None = payload.get("sub")
    if not username:
        raise ValueError("Token missing subject claim")
    return username
