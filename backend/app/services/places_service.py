"""Google Places search, proxied.

This is the ONLY module that talks to Google. It exists so the server key never
reaches the browser and so repeated searches are answered from memory rather
than re-billed: Text Search is charged per request, and a search box issues a
lot of them.

Failure is explicit — callers get `MapsNotConfiguredError`, `ValueError` or
`PlacesUpstreamError`, and the router turns those into 503 / 422 / 502. Nothing
here raises `HTTPException`.
"""

from __future__ import annotations

import time

import httpx

from app.core.config import settings
from app.schemas.listies import PlaceResult

_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"

# Google bills Text Search by the fields requested, so the mask is a cost
# lever: ask for exactly what a place cell stores and nothing more.
_FIELD_MASK = ",".join(
    [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.location",
    ]
)

_TIMEOUT_SECONDS = 6.0
_BIAS_RADIUS_METRES = 20_000.0

CACHE_TTL_SECONDS = 3600
CACHE_MAX_ENTRIES = 128

# (query, near) -> (stored_at, results)
_cache: dict[tuple[str, str | None], tuple[float, list[PlaceResult]]] = {}


class MapsNotConfiguredError(RuntimeError):
    """No Google credentials are configured, so search cannot work at all."""


class PlacesUpstreamError(RuntimeError):
    """Google refused, failed or timed out."""


def _now() -> float:
    """Indirection so tests can advance the clock without sleeping."""
    return time.monotonic()


def maps_enabled() -> bool:
    """Both keys, or nothing: search needs the server key, the map the browser one."""
    return bool(settings.google_maps_server_key and settings.google_maps_browser_key)


def browser_key() -> str | None:
    return settings.google_maps_browser_key or None


def clear_cache() -> None:
    _cache.clear()


def cache_size() -> int:
    return len(_cache)


def _parse_near(near: str | None) -> tuple[float, float] | None:
    """`"lat,lng"` → a point, or `None`.

    A malformed bias is dropped rather than fatal: the search is still useful
    unbiased, and failing the whole request over a hint would be worse.
    """
    if not near:
        return None
    parts = near.split(",")
    if len(parts) != 2:
        return None
    try:
        lat, lng = float(parts[0]), float(parts[1])
    except ValueError:
        return None
    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        return None
    return lat, lng


def _normalise(payload: dict) -> list[PlaceResult]:
    """Keep the places that carry everything a place cell needs; drop the rest."""
    results: list[PlaceResult] = []
    for place in payload.get("places") or []:
        location = place.get("location") or {}
        place_id = place.get("id")
        name = (place.get("displayName") or {}).get("text")
        lat, lng = location.get("latitude"), location.get("longitude")
        if not place_id or not name or lat is None or lng is None:
            continue
        results.append(
            PlaceResult(
                place_id=place_id,
                name=name,
                address=place.get("formattedAddress") or "",
                lat=lat,
                lng=lng,
            )
        )
    return results


def _store(key: tuple[str, str | None], results: list[PlaceResult]) -> None:
    if len(_cache) >= CACHE_MAX_ENTRIES:
        # Evict the oldest entry; dicts keep insertion order.
        _cache.pop(next(iter(_cache)))
    _cache[key] = (_now(), results)


def search(q: str, near: str | None = None) -> list[PlaceResult]:
    query = q.strip()
    if not query:
        raise ValueError("a search needs a query")
    if not maps_enabled():
        raise MapsNotConfiguredError(
            "Google Maps is not configured on this server "
            "(GOOGLE_MAPS_SERVER_KEY / GOOGLE_MAPS_BROWSER_KEY)"
        )

    point = _parse_near(near)
    key = (query.casefold(), f"{point[0]},{point[1]}" if point else None)

    cached = _cache.get(key)
    if cached and _now() - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    body: dict[str, object] = {"textQuery": query}
    if point:
        body["locationBias"] = {
            "circle": {
                "center": {"latitude": point[0], "longitude": point[1]},
                "radius": _BIAS_RADIUS_METRES,
            }
        }

    try:
        with httpx.Client(timeout=_TIMEOUT_SECONDS) as client:
            response = client.post(
                _TEXT_SEARCH_URL,
                json=body,
                headers={
                    "X-Goog-Api-Key": settings.google_maps_server_key,
                    "X-Goog-FieldMask": _FIELD_MASK,
                },
            )
    except httpx.HTTPError as exc:
        # Never surface the upstream detail: it can echo the key back.
        raise PlacesUpstreamError("Place search is unavailable right now") from exc

    if response.status_code >= 400:
        raise PlacesUpstreamError(f"Place search failed upstream (status {response.status_code})")

    results = _normalise(response.json())
    _store(key, results)
    return results
