"""Live note events (Story 2.2) — Shared Notes' instance of the platform bus.

Keyed by `note_id`. The mechanics, and the single-worker assumption they rest
on, live in `app.core.events`.
"""

from __future__ import annotations

from app.core.events import Event, EventBus

_bus = EventBus("shared-notes")

# Module-level aliases so callers read `events.publish(note_id, ...)` rather
# than reaching through a private instance.
subscribe = _bus.subscribe
unsubscribe = _bus.unsubscribe
publish = _bus.publish
is_stale = _bus.is_stale
subscriber_count = _bus.subscriber_count
# The per-subscriber queue cap, for the overflow tests.
MAX_QUEUE = _bus.max_queue

__all__ = [
    "Event",
    "MAX_QUEUE",
    "subscribe",
    "unsubscribe",
    "publish",
    "is_stale",
    "subscriber_count",
]
