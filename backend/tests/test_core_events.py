"""The platform's process-local event bus (`app.core.events`).

Extracted from two byte-identical app copies. These tests pin the behaviour
both apps relied on, plus the isolation the shared implementation introduces:
two buses must not see each other's subscribers even under the same key.
"""

from __future__ import annotations

import asyncio

import pytest

from app.core.events import EventBus


def test_publish_reaches_every_subscriber_of_a_key() -> None:
    async def scenario() -> tuple[dict, dict]:
        bus = EventBus("t")
        q1 = bus.subscribe("k")
        q2 = bus.subscribe("k")
        bus.publish("k", {"n": 1})
        return (
            await asyncio.wait_for(q1.get(), timeout=1),
            await asyncio.wait_for(q2.get(), timeout=1),
        )

    a, b = asyncio.run(scenario())
    assert a == b == {"n": 1}


def test_publish_is_scoped_to_its_key() -> None:
    async def scenario() -> bool:
        bus = EventBus("t")
        mine = bus.subscribe("k1")
        bus.subscribe("k2")
        bus.publish("k2", {"n": 1})
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(mine.get(), timeout=0.05)
        return True

    assert asyncio.run(scenario())


def test_two_buses_do_not_see_each_others_subscribers() -> None:
    """The reason each app holds its own instance: keys must not collide.

    A Listies sheet id and a Shared Notes note id live in different key spaces;
    with one global registry, an id shared by accident would cross the streams.
    """

    async def scenario() -> tuple[int, int, bool]:
        one = EventBus("one")
        two = EventBus("two")
        queue = one.subscribe("same-id")
        two.subscribe("same-id")

        two.publish("same-id", {"from": "two"})
        await asyncio.sleep(0)
        return one.subscriber_count("same-id"), two.subscriber_count("same-id"), queue.empty()

    mine, theirs, untouched = asyncio.run(scenario())
    assert mine == theirs == 1
    assert untouched  # the other bus's publish never reached this queue


def test_unsubscribe_removes_the_subscriber() -> None:
    async def scenario() -> int:
        bus = EventBus("t")
        queue = bus.subscribe("k")
        bus.unsubscribe("k", queue)
        return bus.subscriber_count("k")

    assert asyncio.run(scenario()) == 0


def test_unsubscribe_is_idempotent() -> None:
    async def scenario() -> int:
        bus = EventBus("t")
        queue = bus.subscribe("k")
        bus.unsubscribe("k", queue)
        bus.unsubscribe("k", queue)
        return bus.subscriber_count("k")

    assert asyncio.run(scenario()) == 0


def test_publishing_to_nobody_is_a_no_op() -> None:
    EventBus("t").publish("k", {"n": 1})


def test_an_emptied_key_leaves_no_registry_entry() -> None:
    """Otherwise the registry grows one entry per document ever opened."""

    async def scenario() -> bool:
        bus = EventBus("t")
        queue = bus.subscribe("k")
        bus.unsubscribe("k", queue)
        return "k" not in bus._subs

    assert asyncio.run(scenario())


def test_overflow_marks_the_subscriber_stale_and_drops_the_event() -> None:
    async def scenario() -> tuple[bool, int]:
        bus = EventBus("t", max_queue=4)
        queue = bus.subscribe("k")
        for i in range(4):
            queue.put_nowait({"n": i})  # fill to capacity
        bus.publish("k", {"overflow": True})
        # Let the scheduled delivery callback run.
        await asyncio.sleep(0)
        await asyncio.sleep(0)
        return bus.is_stale("k", queue), queue.qsize()

    stale, size = asyncio.run(scenario())
    assert stale is True
    assert size == 4  # the overflow event was dropped, not queued


def test_a_healthy_subscriber_is_not_stale() -> None:
    async def scenario() -> bool:
        bus = EventBus("t")
        queue = bus.subscribe("k")
        return bus.is_stale("k", queue)

    assert asyncio.run(scenario()) is False


def test_an_unknown_subscriber_reads_as_stale() -> None:
    """A dropped subscriber must not be treated as healthy by the SSE loop."""

    async def scenario() -> bool:
        bus = EventBus("t")
        queue = bus.subscribe("k")
        bus.unsubscribe("k", queue)
        return bus.is_stale("k", queue)

    assert asyncio.run(scenario()) is True


def test_publish_crosses_threads_onto_the_subscribers_loop() -> None:
    """Writes run in Starlette's threadpool; subscribers live on the loop.

    This is the property the whole module exists for — a plain `put_nowait`
    from another thread would not be safe.
    """
    import threading

    async def scenario() -> dict:
        bus = EventBus("t")
        queue = bus.subscribe("k")
        thread = threading.Thread(target=bus.publish, args=("k", {"n": 1}))
        thread.start()
        thread.join()
        return await asyncio.wait_for(queue.get(), timeout=2)

    assert asyncio.run(scenario()) == {"n": 1}
