"""Live ship events: ISS Vanguard's instance of the platform bus.

Keyed by ship id. The mechanics, and the single-worker assumption they rest on,
live in `app.core.events`.
"""

from __future__ import annotations

from app.core.events import Event, EventBus

_bus = EventBus("iss-vanguard")

subscribe = _bus.subscribe
unsubscribe = _bus.unsubscribe
publish = _bus.publish
is_stale = _bus.is_stale
subscriber_count = _bus.subscriber_count

__all__ = ["Event", "subscribe", "unsubscribe", "publish", "is_stale", "subscriber_count"]
