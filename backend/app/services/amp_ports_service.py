"""Per-instance port config for the AMP Instances app: persistence plus the
public-IP setting the copy-link button needs.

Separate from `amp_service`, which stays the only module that talks to AMP.
Raises stdlib `ValueError` on a bad port; the router translates it to HTTP.

Layering: business logic. No HTTPException here. The filesystem is reached only
through `amp_repo`.
"""

from __future__ import annotations

from collections.abc import Iterable

from app.core.config import settings
from app.core.locks import key_lock
from app.repositories import amp_repo

_MIN_PORT = 1
_MAX_PORT = 65535
# A single lock key shared by set_ports and reconcile so their read-modify-write
# cycles never interleave on the one ports file.
_LOCK_KEY = "amp:ports"


def public_ip() -> str | None:
    return settings.amp_public_ip or None


def set_ports(ports: dict[str, int]) -> dict[str, int]:
    """Validate and persist the full id -> port map (replace, not merge)."""
    for instance_id, port in ports.items():
        # bool is an int subclass — reject it explicitly so True/False can't
        # masquerade as a port.
        if not isinstance(port, int) or isinstance(port, bool):
            raise ValueError(f"port for {instance_id!r} must be an integer")
        if not _MIN_PORT <= port <= _MAX_PORT:
            raise ValueError(
                f"port {port} for {instance_id!r} is out of range {_MIN_PORT}-{_MAX_PORT}"
            )
    with key_lock(_LOCK_KEY):
        amp_repo.write_ports(ports)
    return ports


def reconcile(live_ids: Iterable[str]) -> dict[str, int]:
    """Drop stored ports whose instance is gone; return the surviving map.

    Writes back only when something was actually pruned, so the common
    steady-state call (every instances poll) does no disk I/O.
    """
    live = set(live_ids)
    with key_lock(_LOCK_KEY):
        current = amp_repo.read_ports()
        pruned = {key: value for key, value in current.items() if key in live}
        if pruned != current:
            amp_repo.write_ports(pruned)
    return pruned
