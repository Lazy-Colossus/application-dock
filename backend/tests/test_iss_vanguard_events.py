"""The live ship stream: token gating over HTTP, streaming via the generator."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.routers.iss_vanguard import sse_frames
from app.services import iss_vanguard_events as events
from app.services import iss_vanguard_service as service

client = TestClient(app)


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "jwt_secret_key", "test-secret-key-for-tests-only")


def test_events_rejects_a_bad_token() -> None:
    assert client.get("/api/iss-vanguard/ship/events?token=garbage").status_code == 401


def test_events_without_a_token_is_422() -> None:
    assert client.get("/api/iss-vanguard/ship/events").status_code == 422


async def _never_disconnected() -> bool:
    return False


def test_sse_frames_open_deliver_and_unsubscribe() -> None:
    ship_id = service.ensure_ship("ana")

    async def scenario() -> tuple[str, dict, int]:
        queue = events.subscribe(ship_id)
        gen = sse_frames(ship_id, queue, _never_disconnected, keepalive=0.05)
        try:
            opening = await asyncio.wait_for(gen.__anext__(), timeout=2)
            events.publish(ship_id, {"type": "ship.changed", "ship_id": ship_id, "rev": 1})
            frame = ""
            while not frame.startswith("data:"):
                frame = await asyncio.wait_for(gen.__anext__(), timeout=2)
        finally:
            await gen.aclose()
        return (
            opening.strip(),
            json.loads(frame.removeprefix("data:")),
            (events.subscriber_count(ship_id)),
        )

    opening, payload, remaining = asyncio.run(scenario())
    assert opening == ": connected"
    assert payload == {"type": "ship.changed", "ship_id": ship_id, "rev": 1}
    assert remaining == 0
