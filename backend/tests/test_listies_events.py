"""Tests for live propagation over SSE (Story 5.2).

Three layers: the process-local event bus (real asyncio queues), event emission
from the service (publish spy), and the SSE endpoint via TestClient (auth and
membership gating, plus reading a bounded number of frames). No test opens a
real network socket — TestClient is in-process and the client composable is
tested separately on the frontend.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers.listies import sse_frames
from app.schemas.listies import ColumnSpec
from app.services import auth_service
from app.services import listies_events as events
from app.services import listies_service as service

client = TestClient(app)

# The service takes ColumnSpec models (the router coerces the raw JSON dicts).
COLS = [ColumnSpec(name="Item", type="text")]


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    for name in ("alice", "bob"):
        auth_service.create_user(name)


# ── the event bus ───────────────────────────────────────────────────────────────


def test_publish_reaches_every_subscriber_of_a_sheet() -> None:
    async def scenario() -> tuple[dict, dict]:
        q1 = events.subscribe("s-1")
        q2 = events.subscribe("s-1")
        try:
            events.publish("s-1", {"type": "sheet.changed", "rev": 1})
            a = await asyncio.wait_for(q1.get(), timeout=1)
            b = await asyncio.wait_for(q2.get(), timeout=1)
            return a, b
        finally:
            events.unsubscribe("s-1", q1)
            events.unsubscribe("s-1", q2)

    a, b = asyncio.run(scenario())
    assert a == b == {"type": "sheet.changed", "rev": 1}


def test_publish_is_scoped_to_its_sheet() -> None:
    async def scenario() -> bool:
        mine = events.subscribe("s-1")
        other = events.subscribe("s-2")
        try:
            events.publish("s-2", {"type": "x"})
            with pytest.raises(asyncio.TimeoutError):
                await asyncio.wait_for(mine.get(), timeout=0.05)
            got = await asyncio.wait_for(other.get(), timeout=1)
            return got == {"type": "x"}
        finally:
            events.unsubscribe("s-1", mine)
            events.unsubscribe("s-2", other)

    assert asyncio.run(scenario())


def test_unsubscribe_stops_delivery_and_clears_the_sheet() -> None:
    async def scenario() -> int:
        q = events.subscribe("s-1")
        events.unsubscribe("s-1", q)
        events.publish("s-1", {"type": "x"})  # no subscribers → no-op
        return events.subscriber_count("s-1")

    assert asyncio.run(scenario()) == 0


def test_overflow_marks_the_subscriber_stale_and_drops_the_event() -> None:
    async def scenario() -> tuple[bool, int]:
        q = events.subscribe("s-1")
        try:
            for i in range(events._MAX_QUEUE):
                q.put_nowait({"n": i})  # fill to capacity
            events.publish("s-1", {"type": "overflow"})
            # Let the scheduled delivery callback run.
            await asyncio.sleep(0)
            await asyncio.sleep(0)
            return events.is_stale("s-1", q), q.qsize()
        finally:
            events.unsubscribe("s-1", q)

    stale, size = asyncio.run(scenario())
    assert stale is True
    assert size == events._MAX_QUEUE  # the overflow event was dropped, not queued


# ── emission from the service ───────────────────────────────────────────────────


@pytest.fixture
def spy(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    captured: list[dict] = []
    monkeypatch.setattr(events, "publish", lambda sheet_id, event: captured.append(event))
    return captured


def _shared_sheet(owner: str = "alice", members: list[str] | None = None) -> tuple[str, str]:
    sheet = service.create_sheet(owner, "Trip", COLS)
    service.share_sheet(owner, sheet.id, members or ["bob"])
    return sheet.id, sheet.tabs[0].id


def test_content_write_emits_sheet_changed_with_rev_and_actor(spy: list[dict]) -> None:
    sheet_id, tab_id = _shared_sheet()
    service.create_row("bob", sheet_id, tab_id, {})
    assert spy[-1] == {
        "type": "sheet.changed",
        "sheet_id": sheet_id,
        "rev": 1,
        "actor": "bob",
    }
    service.create_row("alice", sheet_id, tab_id, {})
    assert spy[-1]["rev"] == 2
    assert spy[-1]["actor"] == "alice"


def test_private_write_emits_nothing(spy: list[dict]) -> None:
    sheet = service.create_sheet("alice", "Private", COLS)
    service.create_row("alice", sheet.id, sheet.tabs[0].id, {})
    assert spy == []


def test_add_member_emits_members_changed(spy: list[dict]) -> None:
    sheet = service.create_sheet("alice", "Trip", COLS)
    service.share_sheet("alice", sheet.id, ["bob"])  # promote (members.changed)
    spy.clear()
    service.share_sheet("alice", sheet.id, ["bob"])
    # Re-share always re-publishes the current roster.
    assert spy[-1]["type"] == "members.changed"
    assert "alice" in spy[-1]["members"] and "bob" in spy[-1]["members"]


def test_remove_member_emits_members_changed_and_targeted_close(spy: list[dict]) -> None:
    sheet_id, _ = _shared_sheet()
    spy.clear()
    service.remove_member("alice", sheet_id, "bob")
    types = [e["type"] for e in spy]
    assert "members.changed" in types
    closed = next(e for e in spy if e["type"] == "sheet.closed")
    assert closed["reason"] == "removed"
    assert closed["member"] == "bob"


def test_stop_sharing_emits_unshared_close(spy: list[dict]) -> None:
    sheet_id, _ = _shared_sheet()
    spy.clear()
    service.stop_sharing("alice", sheet_id)
    assert spy[-1] == {"type": "sheet.closed", "sheet_id": sheet_id, "reason": "unshared"}


def test_delete_shared_sheet_emits_deleted_close(spy: list[dict]) -> None:
    sheet_id, _ = _shared_sheet()
    spy.clear()
    service.delete_sheet("alice", sheet_id)
    assert spy[-1] == {"type": "sheet.closed", "sheet_id": sheet_id, "reason": "deleted"}


# ── the SSE endpoint ────────────────────────────────────────────────────────────


def _token(username: str) -> str:
    return auth_service.create_access_token(username)


def _make_shared(owner: str = "alice", members: list[str] | None = None) -> str:
    sheet = service.create_sheet(owner, "Trip", COLS)
    service.share_sheet(owner, sheet.id, members or ["bob"])
    return sheet.id


def test_events_rejects_bad_or_missing_token() -> None:
    sheet_id = _make_shared()
    assert client.get(f"/api/listies/sheets/{sheet_id}/events?token=garbage").status_code == 401
    # No token at all → 422 (missing required query param) — never opens a stream.
    assert client.get(f"/api/listies/sheets/{sheet_id}/events").status_code == 422


def test_events_non_member_gets_404() -> None:
    sheet_id = _make_shared(members=["bob"])
    auth_service.create_user("mallory")
    resp = client.get(f"/api/listies/sheets/{sheet_id}/events?token={_token('mallory')}")
    assert resp.status_code == 404


async def _never_disconnected() -> bool:
    return False


def test_sse_frames_open_stream_deliver_and_unsubscribe() -> None:
    """The stream opens, delivers a published event, and cleans up on close.

    Drives the `sse_frames` generator directly: the HTTP transports (sync
    TestClient and httpx ASGITransport) both buffer an unbounded stream to
    completion and would deadlock, so the endpoint's gating is tested over HTTP
    and its streaming behaviour is tested here.
    """
    sheet_id = _make_shared(members=["bob"])

    async def scenario() -> tuple[str, dict, int]:
        queue = events.subscribe(sheet_id)
        gen = sse_frames(sheet_id, queue, _never_disconnected, keepalive=0.05)
        try:
            opening = await asyncio.wait_for(gen.__anext__(), timeout=2)
            events.publish(
                sheet_id,
                {"type": "sheet.changed", "sheet_id": sheet_id, "rev": 1, "actor": "alice"},
            )
            frame = ""
            while not frame.startswith("data:"):
                frame = await asyncio.wait_for(gen.__anext__(), timeout=2)
            payload = json.loads(frame.removeprefix("data:").strip())
        finally:
            await gen.aclose()  # runs the finally → unsubscribe
        return opening.strip(), payload, events.subscriber_count(sheet_id)

    opening, payload, remaining = asyncio.run(scenario())
    assert opening == ": connected"
    assert payload == {
        "type": "sheet.changed",
        "sheet_id": sheet_id,
        "rev": 1,
        "actor": "alice",
    }
    assert remaining == 0  # aclose() unsubscribed


def test_sse_frames_emit_keepalive_when_idle() -> None:
    sheet_id = _make_shared(members=["bob"])

    async def scenario() -> str:
        queue = events.subscribe(sheet_id)
        gen = sse_frames(sheet_id, queue, _never_disconnected, keepalive=0.01)
        try:
            await asyncio.wait_for(gen.__anext__(), timeout=2)  # ": connected"
            return await asyncio.wait_for(gen.__anext__(), timeout=2)  # ": ping" (idle)
        finally:
            await gen.aclose()

    assert asyncio.run(scenario()).strip() == ": ping"


def test_sse_frames_stop_on_disconnect() -> None:
    sheet_id = _make_shared(members=["bob"])

    async def disconnected() -> bool:
        return True

    async def scenario() -> list[str]:
        queue = events.subscribe(sheet_id)
        gen = sse_frames(sheet_id, queue, disconnected, keepalive=0.05)
        frames = [f async for f in gen]  # terminates: disconnect breaks the loop
        return frames

    frames = asyncio.run(scenario())
    assert frames == [": connected\n\n"]  # opened, then stopped
    assert events.subscriber_count(sheet_id) == 0
