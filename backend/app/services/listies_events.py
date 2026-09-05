"""Process-local pub/sub for live sheet events (Story 5.2).

A member's write to a shared sheet publishes a coarse event; every other member
subscribed to that sheet refetches and reconverges. Events are keyed by
`sheet_id`.

**SINGLE-WORKER ASSUMPTION.** Subscribers hold `asyncio.Queue`s that live on the
SSE endpoint's event loop, while publishers run in Starlette's threadpool (the
sync `def` route handlers that perform writes). `publish` therefore hops onto
each subscriber's loop via `call_soon_threadsafe`, which is the one safe way to
put into an `asyncio.Queue` from another thread. This is correct because
production runs a single `uvicorn` process (CLAUDE.md). It would NOT fan out
across multiple workers/replicas — that needs an external broker, which is out
of scope (YAGNI).
"""

from __future__ import annotations

import asyncio
import threading
from dataclasses import dataclass, field
from typing import Any

# Per subscriber. A bounded queue means a stalled client cannot grow memory
# without bound: once full, further events are dropped and the subscriber is
# marked stale (it will fully resync when it reconnects with a fresh `rev`).
_MAX_QUEUE = 1000

Event = dict[str, Any]


@dataclass
class _Meta:
    loop: asyncio.AbstractEventLoop
    stale: bool = field(default=False)


# sheet_id → { queue: meta }. Guarded by `_lock` because publishers and
# subscribers run on different threads.
_subs: dict[str, dict[asyncio.Queue[Event], _Meta]] = {}
_lock = threading.Lock()


def subscribe(sheet_id: str) -> asyncio.Queue[Event]:
    """Register interest in a sheet's events; returns the subscriber's queue.

    Must be called from the event loop that will drain the queue (the SSE
    endpoint), so the loop can be captured for cross-thread delivery.
    """
    queue: asyncio.Queue[Event] = asyncio.Queue(maxsize=_MAX_QUEUE)
    meta = _Meta(loop=asyncio.get_running_loop())
    with _lock:
        _subs.setdefault(sheet_id, {})[queue] = meta
    return queue


def unsubscribe(sheet_id: str, queue: asyncio.Queue[Event]) -> None:
    """Remove a subscriber. Safe to call more than once."""
    with _lock:
        subs = _subs.get(sheet_id)
        if subs and queue in subs:
            del subs[queue]
            if not subs:
                del _subs[sheet_id]


def publish(sheet_id: str, event: Event) -> None:
    """Fan an event out to every subscriber of `sheet_id`.

    Safe to call from any thread (typically a sync write handler). Delivery is
    scheduled on each subscriber's loop; a subscriber whose queue is full is
    marked stale and the event is dropped for it.
    """
    with _lock:
        targets = list(_subs.get(sheet_id, {}).items())
    for queue, meta in targets:
        meta.loop.call_soon_threadsafe(_deliver, queue, meta, event)


def _deliver(queue: asyncio.Queue[Event], meta: _Meta, event: Event) -> None:
    try:
        queue.put_nowait(event)
    except asyncio.QueueFull:
        meta.stale = True


def is_stale(sheet_id: str, queue: asyncio.Queue[Event]) -> bool:
    """Whether this subscriber overflowed and should be dropped (it will resync)."""
    with _lock:
        meta = _subs.get(sheet_id, {}).get(queue)
        return meta.stale if meta is not None else True


def subscriber_count(sheet_id: str) -> int:
    """Number of live subscribers for a sheet (for tests/introspection)."""
    with _lock:
        return len(_subs.get(sheet_id, {}))
