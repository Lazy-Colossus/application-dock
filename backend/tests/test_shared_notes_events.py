"""Live propagation over SSE for Shared Notes (Story 2.2).

Three layers: the process-local event bus (real asyncio queues), event emission
from the service (publish spy), and the SSE endpoint via TestClient (auth and
membership gating). No test opens a real network socket — TestClient is
in-process and the client composable is tested on the frontend.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.routers.shared_notes import sse_frames
from app.services import auth_service
from app.services import shared_notes_events as events
from app.services import shared_notes_service as service

client = TestClient(app)


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    # The SSE `?token=` path mints and verifies real tokens, which needs a
    # secret; without one these tests pass only where the environment has one.
    monkeypatch.setattr(settings, "jwt_secret_key", "test-secret-key-for-tests-only")
    for name in ("ana", "bo", "cy"):
        auth_service.create_user(name)


# ── the event bus ─────────────────────────────────────────────────────────────


def test_publish_reaches_every_subscriber_of_a_note() -> None:
    async def scenario() -> tuple[dict, dict]:
        q1 = events.subscribe("n-1")
        q2 = events.subscribe("n-1")
        try:
            events.publish("n-1", {"type": "note.changed", "rev": 1})
            a = await asyncio.wait_for(q1.get(), timeout=1)
            b = await asyncio.wait_for(q2.get(), timeout=1)
            return a, b
        finally:
            events.unsubscribe("n-1", q1)
            events.unsubscribe("n-1", q2)

    a, b = asyncio.run(scenario())
    assert a == b == {"type": "note.changed", "rev": 1}


def test_publish_is_scoped_to_its_note() -> None:
    async def scenario() -> bool:
        mine = events.subscribe("n-1")
        other = events.subscribe("n-2")
        try:
            events.publish("n-2", {"type": "x"})
            with pytest.raises(asyncio.TimeoutError):
                await asyncio.wait_for(mine.get(), timeout=0.05)
            got = await asyncio.wait_for(other.get(), timeout=1)
            return got == {"type": "x"}
        finally:
            events.unsubscribe("n-1", mine)
            events.unsubscribe("n-2", other)

    assert asyncio.run(scenario())


def test_publish_to_nobody_is_harmless() -> None:
    events.publish("n-unsubscribed", {"type": "note.changed"})


def test_unsubscribe_is_idempotent() -> None:
    async def scenario() -> int:
        queue = events.subscribe("n-1")
        events.unsubscribe("n-1", queue)
        events.unsubscribe("n-1", queue)
        return events.subscriber_count("n-1")

    assert asyncio.run(scenario()) == 0


# ── emission from the service ─────────────────────────────────────────────────


@pytest.fixture
def spy(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    seen: list[dict] = []
    monkeypatch.setattr(events, "publish", lambda note_id, event: seen.append(event))
    return seen


def _shared_note(owner: str = "ana", members: list[str] | None = None) -> str:
    note = service.create_note(owner, "Groceries")
    service.share_note(owner, note.id, members or ["bo"])
    return note.id


def test_a_content_write_emits_note_changed_with_rev_and_actor(spy: list[dict]) -> None:
    note_id = _shared_note()
    spy.clear()

    service.update_note("bo", note_id, body="milk")
    assert spy[-1] == {
        "type": "note.changed",
        "note_id": note_id,
        "rev": 1,
        "actor": "bo",
    }

    service.update_note("ana", note_id, body="milk\neggs")
    assert spy[-1]["rev"] == 2
    assert spy[-1]["actor"] == "ana"


def test_a_title_write_emits_note_changed_too(spy: list[dict]) -> None:
    note_id = _shared_note()
    spy.clear()

    service.update_note("ana", note_id, title="Shopping")
    assert spy[-1]["type"] == "note.changed"


def test_adding_a_member_emits_members_changed(spy: list[dict]) -> None:
    note = service.create_note("ana", "Groceries")
    spy.clear()

    service.share_note("ana", note.id, ["bo"])
    assert spy[-1] == {
        "type": "members.changed",
        "note_id": note.id,
        "members": ["ana", "bo"],
    }


def test_removing_a_member_emits_members_changed_and_a_targeted_close(
    spy: list[dict],
) -> None:
    note_id = _shared_note()
    spy.clear()

    service.remove_member("ana", note_id, "bo")
    types = [e["type"] for e in spy]
    assert "members.changed" in types

    closed = next(e for e in spy if e["type"] == "note.closed")
    assert closed["reason"] == "removed"
    # Targeted: only the removed member should act on it.
    assert closed["member"] == "bo"


def test_deleting_a_note_emits_a_deleted_close(spy: list[dict]) -> None:
    note_id = _shared_note()
    spy.clear()

    service.delete_note("ana", note_id)
    assert spy[-1] == {
        "type": "note.closed",
        "note_id": note_id,
        "reason": "deleted",
    }


def test_a_rejected_write_emits_nothing(spy: list[dict]) -> None:
    note_id = _shared_note()
    spy.clear()

    with pytest.raises(ValueError):
        service.update_note("ana", note_id, title="   ")
    with pytest.raises(PermissionError):
        service.remove_member("bo", note_id, "ana")
    with pytest.raises(FileNotFoundError):
        service.update_note("cy", note_id, body="sneaky")

    assert spy == []


# ── the SSE endpoint ──────────────────────────────────────────────────────────


def _token(username: str) -> str:
    return auth_service.create_access_token(username)


def test_events_rejects_a_bad_token() -> None:
    note_id = _shared_note()
    response = client.get(f"/api/shared-notes/notes/{note_id}/events?token=garbage")
    assert response.status_code == 401


def test_events_without_a_token_never_opens_a_stream() -> None:
    note_id = _shared_note()
    assert client.get(f"/api/shared-notes/notes/{note_id}/events").status_code == 422


def test_events_gives_a_non_member_the_same_404_as_a_missing_note() -> None:
    note_id = _shared_note(members=["bo"])

    existing = client.get(f"/api/shared-notes/notes/{note_id}/events?token={_token('cy')}")
    missing = client.get(f"/api/shared-notes/notes/n-00000000/events?token={_token('cy')}")
    assert existing.status_code == missing.status_code == 404
    assert existing.json() == missing.json()


async def _never_disconnected() -> bool:
    return False


def test_sse_frames_open_deliver_and_unsubscribe() -> None:
    """The stream opens, delivers a published event, and cleans up on close.

    Drives the `sse_frames` generator directly: the HTTP transports buffer an
    unbounded stream to completion and would deadlock, so the endpoint's gating
    is tested over HTTP and its streaming behaviour here.
    """
    note_id = _shared_note()

    async def scenario() -> tuple[str, dict, int]:
        queue = events.subscribe(note_id)
        gen = sse_frames(note_id, queue, _never_disconnected, keepalive=0.05)
        try:
            opening = await asyncio.wait_for(gen.__anext__(), timeout=2)
            events.publish(
                note_id,
                {"type": "note.changed", "note_id": note_id, "rev": 1, "actor": "ana"},
            )
            frame = ""
            while not frame.startswith("data:"):
                frame = await asyncio.wait_for(gen.__anext__(), timeout=2)
            payload = json.loads(frame.removeprefix("data:").strip())
        finally:
            await gen.aclose()  # runs the finally → unsubscribe
        return opening.strip(), payload, events.subscriber_count(note_id)

    opening, payload, remaining = asyncio.run(scenario())
    assert opening == ": connected"
    assert payload == {
        "type": "note.changed",
        "note_id": note_id,
        "rev": 1,
        "actor": "ana",
    }
    assert remaining == 0


def test_sse_frames_emit_a_keepalive_when_idle() -> None:
    note_id = _shared_note()

    async def scenario() -> str:
        queue = events.subscribe(note_id)
        gen = sse_frames(note_id, queue, _never_disconnected, keepalive=0.01)
        try:
            await asyncio.wait_for(gen.__anext__(), timeout=2)  # ": connected"
            return await asyncio.wait_for(gen.__anext__(), timeout=2)  # ": ping"
        finally:
            await gen.aclose()

    assert asyncio.run(scenario()).strip() == ": ping"


def test_sse_frames_stop_on_disconnect() -> None:
    note_id = _shared_note()

    async def disconnected() -> bool:
        return True

    async def scenario() -> list[str]:
        queue = events.subscribe(note_id)
        return [frame async for frame in sse_frames(note_id, queue, disconnected)]

    assert asyncio.run(scenario()) == [": connected\n\n"]
    assert events.subscriber_count(note_id) == 0
