"""Maps configuration and the proxied Places search (Story 4.1).

No test here touches the network: `httpx.Client` is swapped for one built on a
`MockTransport`, so the real request construction (URL, headers, body) is still
exercised while the response is ours.
"""

from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services import places_service

client = TestClient(app)

_UPSTREAM_PLACE = {
    "id": "ChIJ_place_1",
    "displayName": {"text": "Blue Bottle Coffee", "languageCode": "en"},
    "formattedAddress": "Rua Nova 12, Lisboa",
    "location": {"latitude": 38.7107, "longitude": -9.1373},
}


@pytest.fixture(autouse=True)
def configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "google_maps_server_key", "server-key-abc")
    monkeypatch.setattr(settings, "google_maps_browser_key", "browser-key-xyz")
    places_service.clear_cache()


@pytest.fixture
def unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "google_maps_server_key", "")
    monkeypatch.setattr(settings, "google_maps_browser_key", "")


def stub_upstream(
    monkeypatch: pytest.MonkeyPatch,
    handler,
) -> list[httpx.Request]:
    """Route every httpx request through `handler`; return the captured requests."""
    seen: list[httpx.Request] = []

    def capture(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    real_client = httpx.Client

    def factory(*args, **kwargs):
        kwargs.pop("transport", None)
        return real_client(*args, transport=httpx.MockTransport(capture), **kwargs)

    monkeypatch.setattr(places_service.httpx, "Client", factory)
    return seen


def ok(places: list[dict] | None = None):
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"places": [_UPSTREAM_PLACE] if places is None else places})

    return handler


# ── GET /maps-config ──────────────────────────────────────────────────────────


def test_maps_config_reports_enabled_and_hands_over_the_browser_key() -> None:
    resp = client.get("/api/listies/maps-config")

    assert resp.status_code == 200
    assert resp.json() == {"enabled": True, "browser_key": "browser-key-xyz"}


def test_maps_config_never_leaks_the_server_key() -> None:
    body = client.get("/api/listies/maps-config").text
    assert "server-key-abc" not in body


def test_maps_config_reports_disabled_when_unconfigured(unconfigured: None) -> None:
    resp = client.get("/api/listies/maps-config")

    assert resp.status_code == 200
    assert resp.json()["enabled"] is False
    assert resp.json().get("browser_key") is None


def test_maps_config_is_disabled_when_only_one_key_is_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "google_maps_browser_key", "")
    assert client.get("/api/listies/maps-config").json()["enabled"] is False


# ── GET /places/search ────────────────────────────────────────────────────────


def test_search_returns_normalised_results(monkeypatch: pytest.MonkeyPatch) -> None:
    stub_upstream(monkeypatch, ok())

    resp = client.get("/api/listies/places/search", params={"q": "coffee lisbon"})

    assert resp.status_code == 200
    assert resp.json() == [
        {
            "place_id": "ChIJ_place_1",
            "name": "Blue Bottle Coffee",
            "address": "Rua Nova 12, Lisboa",
            "lat": 38.7107,
            "lng": -9.1373,
        }
    ]


def test_search_sends_the_query_and_the_server_key_upstream(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen = stub_upstream(monkeypatch, ok())

    client.get("/api/listies/places/search", params={"q": "coffee lisbon"})

    request = seen[0]
    assert request.url.host == "places.googleapis.com"
    assert request.headers["X-Goog-Api-Key"] == "server-key-abc"
    assert b"coffee lisbon" in request.content


def test_search_asks_only_for_the_fields_we_keep(monkeypatch: pytest.MonkeyPatch) -> None:
    """The field mask is a billing lever, not a formality."""
    seen = stub_upstream(monkeypatch, ok())

    client.get("/api/listies/places/search", params={"q": "coffee"})

    mask = seen[0].headers["X-Goog-FieldMask"]
    assert set(mask.split(",")) == {
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.location",
    }


def test_search_skips_a_result_missing_its_essentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stub_upstream(
        monkeypatch,
        ok([{"id": "ChIJ_x", "displayName": {"text": "No location"}}, _UPSTREAM_PLACE]),
    )

    body = client.get("/api/listies/places/search", params={"q": "coffee"}).json()

    assert [p["place_id"] for p in body] == ["ChIJ_place_1"]


def test_search_returns_an_empty_list_when_google_finds_nothing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stub_upstream(monkeypatch, ok([]))
    assert client.get("/api/listies/places/search", params={"q": "zzzz"}).json() == []


# ── location bias ─────────────────────────────────────────────────────────────


def test_search_biases_towards_a_near_point(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = stub_upstream(monkeypatch, ok())

    client.get("/api/listies/places/search", params={"q": "cafe", "near": "38.7107,-9.1373"})

    assert b"locationBias" in seen[0].content
    assert b"38.7107" in seen[0].content


def test_an_unparseable_near_is_ignored_rather_than_fatal(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen = stub_upstream(monkeypatch, ok())

    resp = client.get("/api/listies/places/search", params={"q": "cafe", "near": "nonsense"})

    assert resp.status_code == 200
    assert b"locationBias" not in seen[0].content


def test_an_out_of_range_near_is_ignored(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = stub_upstream(monkeypatch, ok())

    client.get("/api/listies/places/search", params={"q": "cafe", "near": "999,999"})

    assert b"locationBias" not in seen[0].content


# ── caching ───────────────────────────────────────────────────────────────────


def test_a_repeated_search_is_served_from_the_cache(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen = stub_upstream(monkeypatch, ok())

    client.get("/api/listies/places/search", params={"q": "coffee"})
    client.get("/api/listies/places/search", params={"q": "coffee"})

    assert len(seen) == 1


def test_the_cache_ignores_case_and_surrounding_space(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen = stub_upstream(monkeypatch, ok())

    client.get("/api/listies/places/search", params={"q": "Coffee"})
    client.get("/api/listies/places/search", params={"q": "  coffee "})

    assert len(seen) == 1


def test_a_different_near_is_a_different_search(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = stub_upstream(monkeypatch, ok())

    client.get("/api/listies/places/search", params={"q": "cafe", "near": "38.7,-9.1"})
    client.get("/api/listies/places/search", params={"q": "cafe", "near": "41.1,-8.6"})

    assert len(seen) == 2


def test_an_expired_entry_is_fetched_again(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = stub_upstream(monkeypatch, ok())
    clock = {"now": 1000.0}
    monkeypatch.setattr(places_service, "_now", lambda: clock["now"])

    client.get("/api/listies/places/search", params={"q": "coffee"})
    clock["now"] += places_service.CACHE_TTL_SECONDS + 1
    client.get("/api/listies/places/search", params={"q": "coffee"})

    assert len(seen) == 2


def test_the_cache_is_bounded(monkeypatch: pytest.MonkeyPatch) -> None:
    stub_upstream(monkeypatch, ok())

    for i in range(places_service.CACHE_MAX_ENTRIES + 20):
        client.get("/api/listies/places/search", params={"q": f"query {i}"})

    assert places_service.cache_size() <= places_service.CACHE_MAX_ENTRIES


# ── failure modes ─────────────────────────────────────────────────────────────


def test_search_is_503_when_maps_are_not_configured(unconfigured: None) -> None:
    resp = client.get("/api/listies/places/search", params={"q": "coffee"})

    assert resp.status_code == 503
    assert "detail" in resp.json()


def test_an_unconfigured_search_does_not_call_google(
    monkeypatch: pytest.MonkeyPatch, unconfigured: None
) -> None:
    seen = stub_upstream(monkeypatch, ok())
    client.get("/api/listies/places/search", params={"q": "coffee"})
    assert seen == []


@pytest.mark.parametrize("status", [400, 403, 429, 500])
def test_an_upstream_error_is_502(monkeypatch: pytest.MonkeyPatch, status: int) -> None:
    stub_upstream(monkeypatch, lambda _: httpx.Response(status, json={"error": "nope"}))

    resp = client.get("/api/listies/places/search", params={"q": "coffee"})

    assert resp.status_code == 502
    assert "detail" in resp.json()


def test_a_timeout_is_502(monkeypatch: pytest.MonkeyPatch) -> None:
    def timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("too slow", request=request)

    stub_upstream(monkeypatch, timeout)

    assert client.get("/api/listies/places/search", params={"q": "coffee"}).status_code == 502


def test_an_upstream_failure_never_leaks_the_key(monkeypatch: pytest.MonkeyPatch) -> None:
    stub_upstream(monkeypatch, lambda _: httpx.Response(403, json={"error": "bad key"}))

    body = client.get("/api/listies/places/search", params={"q": "coffee"}).text

    assert "server-key-abc" not in body


def test_a_failed_search_is_not_cached(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = stub_upstream(monkeypatch, lambda _: httpx.Response(500, json={}))

    client.get("/api/listies/places/search", params={"q": "coffee"})
    client.get("/api/listies/places/search", params={"q": "coffee"})

    assert len(seen) == 2


@pytest.mark.parametrize("q", ["", "   "])
def test_a_blank_query_is_422(monkeypatch: pytest.MonkeyPatch, q: str) -> None:
    seen = stub_upstream(monkeypatch, ok())

    resp = client.get("/api/listies/places/search", params={"q": q})

    assert resp.status_code == 422
    assert seen == []


def test_a_missing_query_is_422() -> None:
    assert client.get("/api/listies/places/search").status_code == 422


def test_a_query_with_a_space_and_an_ampersand_arrives_intact(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The client encodes spaces as "+"; the query must decode back to a space."""
    seen = stub_upstream(monkeypatch, ok())

    resp = client.get("/api/listies/places/search?q=caf+%26+bar")

    assert resp.status_code == 200
    assert b'"textQuery": "caf & bar"' in seen[0].content.replace(
        b'"textQuery":"', b'"textQuery": "'
    )
