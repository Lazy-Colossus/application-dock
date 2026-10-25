"""Steam store lookups for game names, with a disk cache.

The ONLY module that talks to Steam. Resolves a Steam app id to its game name via
the public appdetails API and caches the result, so steady-state callers make no
external calls.

Layering: business logic. No HTTPException. Never raises on a lookup failure —
returns None so callers degrade gracefully.
"""

from __future__ import annotations

import httpx

from app.repositories import steam_repo

_TIMEOUT_SECONDS = 5.0
_APPDETAILS_URL = "https://store.steampowered.com/api/appdetails"


def _fetch_app_name(app_id: int) -> str | None:
    """The single HTTP seam; tests stub this. None on any failure."""
    try:
        response = httpx.get(
            _APPDETAILS_URL,
            params={"appids": app_id, "filters": "basic"},
            timeout=_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError):
        return None
    entry = data.get(str(app_id)) if isinstance(data, dict) else None
    if not isinstance(entry, dict) or not entry.get("success"):
        return None
    name = (entry.get("data") or {}).get("name")
    return name or None


def game_name(app_id: int) -> str | None:
    """The game's name for `app_id`, cached. None if it can't be resolved.

    A failed lookup is not cached, so a transient Steam outage is retried on the
    next call rather than permanently marking the game unknown.
    """
    cache = steam_repo.read_names()
    key = str(app_id)
    if key in cache:
        return cache[key] or None
    name = _fetch_app_name(app_id)
    if name:
        cache[key] = name
        steam_repo.write_names(cache)
    return name
