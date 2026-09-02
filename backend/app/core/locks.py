"""Per-key locks that serialize read-modify-write sequences on one document.

Persistence is JSON files with no database, so every mutation is a
read-modify-write in the service layer. The atomic writer alone only stops a
reader seeing a *torn* file — it does nothing to stop two writers interleaving
and losing one another's changes. Holding a lock keyed by the target file path
across the whole sequence is what closes that window; the key is the path, so
mutations to different files still run fully concurrently.

**In-process locks are correct here, and only here.** Production runs a single
`uvicorn app.main:app` with no `--workers`, so there is one interpreter, and
sync (`def`) route handlers execute on Starlette's threadpool — threads sharing
memory, which a `threading.Lock` fully serializes. If the deployment ever grows
to multiple uvicorn workers, multiple containers sharing the volume, or moves to
async handlers, these locks stop protecting anything and an OS-level advisory
file lock (`fcntl.flock` on POSIX, `msvcrt.locking` on Windows, or the
`filelock` package) is required instead.
"""

from __future__ import annotations

import threading
from collections.abc import Iterator
from contextlib import contextmanager

# Guards `_locks` itself, so two threads racing to lock a brand-new key cannot
# each create their own lock and both proceed.
_registry_lock = threading.Lock()
_locks: dict[str, threading.RLock] = {}


def _lock_for(key: str) -> threading.RLock:
    """Return the one lock for `key`, creating it on first use.

    **Reentrant on purpose.** Some transactions legitimately compose: a Hotaru
    service holds the vocab aggregate's lock across a read-modify-write while
    calling repository helpers that lock the same aggregate themselves. With a
    plain `Lock` that self-deadlocks; with an `RLock` the outer transaction keeps
    its guarantee and the inner acquisition is a no-op. The cost is that a
    genuinely nested transaction is permitted rather than rejected, so a mutation
    made by an inner block can still be overwritten by the outer block's write —
    keep transactions flat, and treat nesting as a code smell rather than a tool.

    Locks are never evicted: the key space is file paths and a few aggregate
    names, so the registry stays small for the life of the process. Eviction
    would need refcounting to avoid dropping a held lock.
    """
    with _registry_lock:
        lock = _locks.get(key)
        if lock is None:
            lock = threading.RLock()
            _locks[key] = lock
        return lock


@contextmanager
def key_lock(key: str) -> Iterator[None]:
    """Hold the lock for `key` for the duration of the block."""
    with _lock_for(key):
        yield
