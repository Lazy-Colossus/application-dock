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

    # TypeSafe (Jev) — Tea Cabinet category autofill. Server-side only.
    # With this unset, the autofill endpoint reports itself unconfigured (503)
    # and the rest of the app is unaffected.
    typesafe_api_key: str = ""

    # Anthropic (Claude vision) — Tea Cabinet label scan. Server-side only.
    # With this unset, the scan endpoint reports itself unconfigured (503).
    anthropic_api_key: str = ""
    label_scan_model: str = "claude-haiku-4-5"

    # Google Maps (Listies place columns). Optional: with these unset the place
    # column type and the map are simply unavailable, and nothing else changes.
    # The server key is used only server-side; the browser key is handed to the
    # SPA at runtime and should be referrer-restricted.
    google_maps_server_key: str = ""
    google_maps_browser_key: str = ""

    # CubeCoders AMP (ADS controller) — the AMP Instances app. Server-side only.
    # With username/password unset, the endpoints report themselves
    # unconfigured (503) and nothing else is affected. Base URL defaults to a
    # same-host ADS controller.
    amp_base_url: str = "http://localhost:8080"
    amp_username: str = ""
    amp_password: str = ""
    # Public IP/host the AMP instances are reachable on, for the copy-link
    # button. With this unset the copy-link buttons stay disabled and nothing
    # else changes. Handed to the SPA at runtime, never built into the bundle.
    amp_public_ip: str = ""

    # Kalendariq decides capability by which account you logged in as, read as a
    # DENYLIST: these usernames are guests (vote-only) and every other
    # authenticated user is an admin. See the spec's AR-2 — this fails open on
    # purpose, because an admin allowlist fails closed and needs the real
    # account names up front.
    #
    # A plain string, not `list[str]`: pydantic-settings parses a complex-typed
    # field as JSON from the environment, which would make the natural
    # `KALENDARIQ_GUESTS=players,guest` a boot failure.
    kalendariq_guests: str = "players"

    # Users limited to some of the apps, as `user:app,app;user:app`, by app id.
    # An ALLOWLIST per listed user, so an app added later stays hidden from them
    # until it is named here; anyone not listed sees every app. A plain string
    # for the same reason as `kalendariq_guests`.
    app_access: str = (
        "peto:archery,iss-vanguard,floor-planner;patus:archery,iss-vanguard,floor-planner"
    )

    @property
    def app_access_by_user(self) -> dict[str, frozenset[str]]:
        """`app_access` parsed: each limited username to the app ids it may use."""
        access: dict[str, frozenset[str]] = {}
        for entry in self.app_access.split(";"):
            user, _, apps = entry.partition(":")
            if user.strip():
                access[user.strip()] = frozenset(a.strip() for a in apps.split(",") if a.strip())
        return access

    @property
    def kalendariq_guest_usernames(self) -> list[str]:
        """`kalendariq_guests` split on commas, blanks and padding discarded."""
        return [name.strip() for name in self.kalendariq_guests.split(",") if name.strip()]


settings = Settings()
try:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
except PermissionError as exc:
    raise RuntimeError(
        f"Cannot create data directory {settings.data_dir!r}: {exc}. "
        "Set the DATA_DIR environment variable to a writable path."
    ) from exc
