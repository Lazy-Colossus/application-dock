"""KDH business logic — shared availability calendars.

Raises stdlib exceptions only (`FileNotFoundError`, `ValueError`,
`PermissionError`); the router translates them. Never raises `HTTPException`.

This module currently holds the helpers the later stories share; calendar CRUD
and the admin gate arrive with the first endpoints in Story 1.3.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime


def now_iso() -> str:
    """Current UTC instant as an ISO-8601 timestamp."""
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def today() -> date:
    """The server's current date — the ONLY source of "today" in this app.

    Every past-versus-future decision routes through here: rejecting a vote on a
    past date, dimming a past day, and choosing whether a calendar's next or
    most recent chosen date is shown. They must agree with each other, and none
    may trust the client's clock (NFR-5).
    """
    return datetime.now(UTC).date()


def is_past(day: str) -> bool:
    """True if `day` (YYYY-MM-DD) is strictly before the server's today.

    Today itself is never past — it is still votable.
    """
    return date.fromisoformat(day) < today()


def new_id(prefix: str) -> str:
    """A stable id: a short prefix and 8 hex characters (AR-3)."""
    return f"{prefix}-{uuid.uuid4().hex[:8]}"
