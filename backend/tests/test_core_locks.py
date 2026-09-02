"""Story 1.8 — the per-key lock primitive behind every document transaction."""

import threading
import time

from app.core.locks import key_lock


def test_same_key_serializes_two_threads() -> None:
    """The whole critical section runs alone — the point of the lock."""
    overlapping = False
    inside = 0
    barrier = threading.Barrier(2)

    def worker() -> None:
        nonlocal overlapping, inside
        barrier.wait()
        with key_lock("same"):
            inside += 1
            if inside > 1:
                overlapping = True
            time.sleep(0.02)
            inside -= 1

    threads = [threading.Thread(target=worker) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not overlapping


def test_different_keys_do_not_block_each_other() -> None:
    """Different files must stay concurrent, or every user waits on every other."""
    started = threading.Event()
    released = threading.Event()

    def holder() -> None:
        with key_lock("key-a"):
            started.set()
            released.wait(timeout=1)

    t = threading.Thread(target=holder)
    t.start()
    assert started.wait(timeout=1)

    # Would time out if "key-b" were serialized against the held "key-a".
    with key_lock("key-b"):
        pass

    released.set()
    t.join()


def test_same_key_returns_the_same_lock_object() -> None:
    """A fresh lock per call would serialize nothing."""
    from app.core.locks import _lock_for

    assert _lock_for("stable") is _lock_for("stable")
    assert _lock_for("stable") is not _lock_for("other")


def test_lock_is_released_when_the_body_raises() -> None:
    try:
        with key_lock("raising"):
            raise ValueError("boom")
    except ValueError:
        pass

    # Re-acquiring proves the lock was not left held.
    with key_lock("raising"):
        pass


def test_same_thread_may_reenter_the_same_key() -> None:
    """Composed transactions must not self-deadlock (see `_lock_for`)."""
    with key_lock("nested"):
        with key_lock("nested"):
            pass

    # Still fully released afterwards.
    with key_lock("nested"):
        pass
