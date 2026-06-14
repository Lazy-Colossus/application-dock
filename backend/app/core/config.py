from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    data_dir: Path = Path("/data")
    host_scripts_dir_on_host: Path = Path("/scripts")
    host_project_dir_on_host: str = ""
    host_compose_file_dir_on_host: str = ""


settings = Settings()
try:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
except PermissionError as exc:
    raise RuntimeError(
        f"Cannot create data directory {settings.data_dir!r}: {exc}. "
        "Set the DATA_DIR environment variable to a writable path."
    ) from exc
