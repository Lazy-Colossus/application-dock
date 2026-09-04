from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# config.py -> core -> app -> backend -> repository root
_BACKEND_DIR = Path(__file__).resolve().parents[2]
_REPO_ROOT = _BACKEND_DIR.parent


class Settings(BaseSettings):
    # One `.env` at the repository root serves both local dev and
    # `docker compose` (which reads the same file for its own interpolation),
    # so keys live in a single gitignored place. Paths are absolute so they do
    # not depend on where the process was started from. A `backend/.env` is
    # read second and therefore wins — useful for local-only overrides such as
    # DATA_DIR. Real environment variables still beat both.
    model_config = SettingsConfigDict(
        env_file=(_REPO_ROOT / ".env", _BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    data_dir: Path = Path("/data")
    host_scripts_dir_on_host: Path = Path("/scripts")
    host_project_dir_on_host: str = ""
    host_compose_file_dir_on_host: str = ""
    host_uid: str = ""

    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_days: int = 7

    # Google Maps (Listies place columns). Optional: with these unset the place
    # column type and the map are simply unavailable, and nothing else changes.
    # The server key is used only server-side; the browser key is handed to the
    # SPA at runtime and should be referrer-restricted.
    google_maps_server_key: str = ""
    google_maps_browser_key: str = ""

    # KDH decides capability by which account you logged in as, read as a
    # DENYLIST: these usernames are guests (vote-only) and every other
    # authenticated user is an admin. See the spec's AR-2 — this fails open on
    # purpose, because an admin allowlist fails closed and needs the real
    # account names up front.
    #
    # A plain string, not `list[str]`: pydantic-settings parses a complex-typed
    # field as JSON from the environment, which would make the natural
    # `KDH_GUESTS=players,guest` a boot failure.
    kdh_guests: str = "players"

    @property
    def kdh_guest_usernames(self) -> list[str]:
        """`kdh_guests` split on commas, blanks and padding discarded."""
        return [name.strip() for name in self.kdh_guests.split(",") if name.strip()]


settings = Settings()
try:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
except PermissionError as exc:
    raise RuntimeError(
        f"Cannot create data directory {settings.data_dir!r}: {exc}. "
        "Set the DATA_DIR environment variable to a writable path."
    ) from exc
