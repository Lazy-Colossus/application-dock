"""Process-local pub/sub, keyed by document id.

Consolidates two byte-identical copies (`listies_events` and
`shared_notes_events`) that differed only in the word they used for the key.
Each app owns an `EventBus` instance, so the key spaces stay separate and one
app's sheet id can never collide with another's note id.

A member's write to a shared document publishes a coarse event; every other
member subscribed to that document refetches and reconverges. Events carry
enough to decide whether a refetch is warranted (`rev`, `actor`), never a delta
— there is no replay to get wrong.

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

Event = dict[str, Any]

# Per subscriber. A bounded queue means a stalled client cannot grow memory
# without bound: once full, further events are dropped and the subscriber is
# marked stale (it will fully resync when it reconnects with a fresh `rev`).
MAX_QUEUE = 1000


@dataclass
class _Meta:
    loop: asyncio.AbstractEventLoop
    stale: bool = field(default=False)


class EventBus:
    """Fan events out to subscribers of one key, within one process.

    `name` is for identification only; isolation comes from each app holding
    its own instance.
    """

    def __init__(self, name: str, max_queue: int = MAX_QUEUE) -> None:
        self.name = name
        self.max_queue = max_queue
        # key → { queue: meta }. Guarded by `_lock` because publishers and
        # subscribers run on different threads.
        self._subs: dict[str, dict[asyncio.Queue[Event], _Meta]] = {}
        self._lock = threading.Lock()

    def subscribe(self, key: str) -> asyncio.Queue[Event]:
        """Register interest in a key's events; returns the subscriber's queue.

        Must be called from the event loop that will drain the queue (the SSE
        endpoint), so the loop can be captured for cross-thread delivery.
        """
        queue: asyncio.Queue[Event] = asyncio.Queue(maxsize=self.max_queue)
        meta = _Meta(loop=asyncio.get_running_loop())
        with self._lock:
            self._subs.setdefault(key, {})[queue] = meta
        return queue

    def unsubscribe(self, key: str, queue: asyncio.Queue[Event]) -> None:
        """Remove a subscriber. Safe to call more than once."""
        with self._lock:
            subs = self._subs.get(key)
            if subs and queue in subs:
                del subs[queue]
                if not subs:
                    del self._subs[key]

    def publish(self, key: str, event: Event) -> None:
        """Fan an event out to every subscriber of `key`.

        Safe to call from any thread (typically a sync write handler). Delivery
        is scheduled on each subscriber's loop; a subscriber whose queue is full
        is marked stale and the event is dropped for it.
        """
        with self._lock:
            targets = list(self._subs.get(key, {}).items())
        for queue, meta in targets:
            meta.loop.call_soon_threadsafe(_deliver, queue, meta, event)

    def is_stale(self, key: str, queue: asyncio.Queue[Event]) -> bool:
        """Whether this subscriber overflowed and should be dropped (it resyncs)."""
        with self._lock:
            meta = self._subs.get(key, {}).get(queue)
            return meta.stale if meta is not None else True

    def subscriber_count(self, key: str) -> int:
        """Number of live subscribers for a key (for tests/introspection)."""
        with self._lock:
            return len(self._subs.get(key, {}))


def _deliver(queue: asyncio.Queue[Event], meta: _Meta, event: Event) -> None:
    try:
        queue.put_nowait(event)
    except asyncio.QueueFull:
        meta.stale = True
