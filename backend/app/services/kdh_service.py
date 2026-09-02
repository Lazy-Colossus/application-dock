"""KDH business logic — shared availability calendars.

Raises stdlib exceptions only (`FileNotFoundError`, `ValueError`,
`PermissionError`); the router translates them. Never raises `HTTPException`.

This module currently holds the helpers the later stories share; calendar CRUD
and the admin gate arrive with the first endpoints in Story 1.3.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from app.core.config import settings
from app.repositories import kdh_repo as repo
from app.schemas.kdh import Calendar, CalendarSummary, Invitee


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


# ── Who may do what ──────────────────────────────────────────────────────────


def is_admin(username: str) -> bool:
    """True unless `username` is one of the configured guest accounts.

    A DENYLIST, not an allowlist: the shared credential handed to the group is
    the only restricted account, and every other dock user administers freely.
    See AR-2 for why this fails open on purpose — an allowlist would need the
    owners' real usernames up front and would lock everyone out if one were
    wrong.
    """
    return username not in settings.kdh_guest_usernames


def require_admin(username: str) -> None:
    """Raise `PermissionError` if `username` is a guest. The router maps it to 403."""
    if not is_admin(username):
        raise PermissionError("This action is only available to an admin.")


# ── The invitee colour palette ───────────────────────────────────────────────

# Distinguishable hues, comfortably more than a realistic group. Held here
# rather than in the frontend so a colour is decided once, at assignment, and
# every client renders the same person the same way.
PALETTE: tuple[str, ...] = (
    "#e8643a",  # ember
    "#3a86e8",  # cobalt
    "#6f4ae8",  # violet
    "#2fa36b",  # jade
    "#d64c8f",  # magenta
    "#c9902a",  # amber
    "#2c9fae",  # teal
    "#8a5a2b",  # umber
    "#7a8a2c",  # olive
    "#b6443f",  # brick
    "#5566a8",  # slate blue
    "#9a3fb6",  # orchid
)


def assign_colour(taken: set[str]) -> str:
    """The first palette colour not in `taken`.

    `taken` must include tombstoned invitees still holding past votes (AR-7), so
    a removed person's colour is never reused while their name still renders on
    past days.
    """
    for colour in PALETTE:
        if colour not in taken:
            return colour
    raise ValueError(f"No colours left — a calendar holds at most {len(PALETTE)} invitees.")


# ── Calendars ────────────────────────────────────────────────────────────────


def _clean_name(raw: str, what: str) -> str:
    cleaned = raw.strip()
    if not cleaned:
        raise ValueError(f"{what} must not be empty")
    return cleaned


def _build_invitees(names: list[str]) -> list[Invitee]:
    """Validate the roster and mint an invitee per name.

    Duplicates are compared normalized — " Dani " and "dani" are one person to
    anyone reading the roster — but the name is STORED as typed, because that is
    what renders in every day cell.
    """
    if not names:
        raise ValueError("A calendar needs at least one invitee")

    invitees: list[Invitee] = []
    seen: set[str] = set()
    for order, raw in enumerate(names):
        name = _clean_name(raw, "Invitee name")
        key = name.casefold()
        if key in seen:
            raise ValueError(f"Duplicate invitee name: {name}")
        seen.add(key)
        invitees.append(
            Invitee(
                id=new_id("inv"),
                name=name,
                color=assign_colour({i.color for i in invitees}),
                order=order,
            )
        )
    return invitees


def create_calendar(username: str, name: str, invitee_names: list[str]) -> Calendar:
    """Create a calendar seeded with its roster. Admin only."""
    require_admin(username)

    cleaned = _clean_name(name, "Calendar name")
    invitees = _build_invitees(invitee_names)

    stamp = now_iso()
    calendar = Calendar(
        schema_version=repo.CURRENT_SCHEMA_VERSION,
        id=new_id("cal"),
        name=cleaned,
        created_at=stamp,
        created_by=username,
        updated_at=stamp,
        invitees=invitees,
    )
    repo.write_calendar(calendar)
    return calendar


def get_calendar(calendar_id: str) -> Calendar:
    """One calendar. Raises FileNotFoundError if unknown, ValueError if malformed."""
    return repo.read_calendar(calendar_id)


def list_calendar_summaries() -> list[CalendarSummary]:
    """Every calendar, newest first, as the landing list needs it.

    Shared, not per-user: admins and guests see exactly the same list.
    """
    return [
        CalendarSummary(
            id=calendar.id,
            name=calendar.name,
            # Tombstoned invitees are off the roster (AR-7), so they do not count.
            invitee_count=sum(1 for i in calendar.invitees if i.removed_at is None),
            created_at=calendar.created_at,
        )
        for calendar in repo.list_calendars()
    ]
