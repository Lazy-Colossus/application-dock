"""Where configuration comes from (Story 4.1 follow-up).

One `.env` at the repository root serves both local dev and `docker compose`,
so keys live in a single gitignored file rather than being exported by hand.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core import config


def _repo_root() -> Path:
    # backend/app/core/config.py -> core -> app -> backend -> repo root
    return Path(config.__file__).resolve().parents[3]


def test_settings_read_the_repository_root_env_file() -> None:
    files = tuple(Path(f) for f in config.Settings.model_config["env_file"])

    root = _repo_root()
    # Root first, then backend: a backend-local file can override the shared
    # one (handy for DATA_DIR in local dev).
    assert files == (root / ".env", root / "backend" / ".env")


def test_the_env_file_paths_do_not_depend_on_the_working_directory() -> None:
    for path in config.Settings.model_config["env_file"]:
        assert Path(path).is_absolute()


def test_a_key_in_an_env_file_is_picked_up(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GOOGLE_MAPS_SERVER_KEY", raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text("GOOGLE_MAPS_SERVER_KEY=from-the-file\n", encoding="utf-8")

    settings = config.Settings(_env_file=env_file)

    assert settings.google_maps_server_key == "from-the-file"


def test_an_exported_variable_still_wins_over_the_env_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """So `export DATA_DIR=./local-data` keeps working alongside a shared .env."""
    env_file = tmp_path / ".env"
    env_file.write_text("GOOGLE_MAPS_SERVER_KEY=from-the-file\n", encoding="utf-8")
    monkeypatch.setenv("GOOGLE_MAPS_SERVER_KEY", "from-the-shell")

    settings = config.Settings(_env_file=env_file)

    assert settings.google_maps_server_key == "from-the-shell"
