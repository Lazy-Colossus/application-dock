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

# Invitee colours are CATEGORICAL — they answer "which person", not "how many".
# They sit deliberately outside the purple family used by the coverage wash
# (DESIGN.md `wash-0`…`wash-6`): a person rendered in purple would read as a
# coverage level. Pastels, so they hold against the violet-black field without
# competing with the wash for attention.
#
# Source of truth: docs/planning-artifacts/ux-designs/ux-kdh-2026-09-03/DESIGN.md
PALETTE: tuple[str, ...] = (
    "#E9A6A0",  # rose
    "#A9C8E8",  # sky
    "#B9DCC2",  # mint
    "#EBD3A0",  # sand
    "#D3B2E8",  # lilac
    "#A8D8D8",  # aqua
    "#C9B8A0",  # clay
    "#9FB8D8",  # steel
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
    summaries = []
    for calendar in repo.list_calendars():
        # Tombstoned invitees are off the roster (AR-7), so they neither count
        # nor appear.
        roster = sorted(_active(calendar), key=lambda i: i.order)
        summaries.append(
            CalendarSummary(
                id=calendar.id,
                name=calendar.name,
                invitee_count=len(roster),
                invitee_names=[i.name for i in roster],
                created_at=calendar.created_at,
            )
        )
    return summaries


def rename_calendar(username: str, calendar_id: str, name: str) -> Calendar:
    """Rename a calendar, leaving everything else exactly as it was. Admin only.

    The first read-modify-write in the app, so the first to need the per-calendar
    transaction (Story 1.8): a rename that read outside the lock could be undone
    by a vote landing between the read and the write.
    """
    require_admin(username)
    cleaned = _clean_name(name, "Calendar name")

    with repo.calendar_transaction(calendar_id) as calendar:
        calendar.name = cleaned
        calendar.updated_at = now_iso()
        return calendar


def delete_calendar(username: str, calendar_id: str) -> None:
    """Delete a calendar and every vote on it. Admin only, and unrecoverable."""
    require_admin(username)
    repo.delete_calendar(calendar_id)


# ── Invitees ─────────────────────────────────────────────────────────────────


def _active(calendar: Calendar) -> list[Invitee]:
    """The roster: everyone not tombstoned (AR-7)."""
    return [i for i in calendar.invitees if i.removed_at is None]


def add_invitee(username: str, calendar_id: str, name: str) -> Calendar:
    """Append an invitee with the next free colour. Admin only.

    Duplicate names are rejected against **active** invitees only: a removed
    person's name is reusable, because "they came back" is a real case. Their
    *colour* is not reusable while they hold past votes, which is why the colour
    check below spans every record including tombstones (AR-7).
    """
    require_admin(username)
    cleaned = _clean_name(name, "Invitee name")

    with repo.calendar_transaction(calendar_id) as calendar:
        if any(i.name.casefold() == cleaned.casefold() for i in _active(calendar)):
            raise ValueError(f"Duplicate invitee name: {cleaned}")

        calendar.invitees.append(
            Invitee(
                id=new_id("inv"),
                name=cleaned,
                color=assign_colour({i.color for i in calendar.invitees}),
                # Past the highest existing order — a removal leaves gaps, so
                # `len(invitees)` would collide with a survivor.
                order=max((i.order for i in calendar.invitees), default=-1) + 1,
            )
        )
        calendar.updated_at = now_iso()
        return calendar


def remove_invitee(username: str, calendar_id: str, invitee_id: str) -> Calendar:
    """Remove an invitee, clearing their FUTURE availability and keeping their past.

    A long-running calendar is a record of sessions actually played, so a person
    who was there in August is still shown on August's days after they leave
    (FR-8). Concretely:

    - their votes on dates **>= today** are deleted; dates **< today** are kept;
    - a date left with an empty map is pruned, so `votes` never holds dead keys;
    - `chosen_dates` is untouched — a session that happened still happened;
    - if they end up holding no votes at all, the record is dropped outright, so
      the common "added by mistake" case leaves no residue. Otherwise the record
      is tombstoned with `removed_at`, keeping their name and colour so past
      cells still render them (AR-7).
    """
    require_admin(username)

    with repo.calendar_transaction(calendar_id) as calendar:
        invitee = next((i for i in calendar.invitees if i.id == invitee_id), None)
        if invitee is None or invitee.removed_at is not None:
            raise FileNotFoundError(invitee_id)

        boundary = today()
        for day in list(calendar.votes):
            if date.fromisoformat(day) >= boundary:
                calendar.votes[day].pop(invitee_id, None)
                if not calendar.votes[day]:
                    del calendar.votes[day]

        still_referenced = any(invitee_id in voters for voters in calendar.votes.values())
        if still_referenced:
            invitee.removed_at = now_iso()
        else:
            calendar.invitees = [i for i in calendar.invitees if i.id != invitee_id]

        calendar.updated_at = now_iso()
        return calendar


def recolour_invitee(calendar_id: str, invitee_id: str, colour: str) -> Calendar:
    """Give an active invitee a different palette colour.

    **Not admin-gated**: choosing your own colour is how a guest makes the roster
    readable to themselves, and the claim that says which invitee you are is not
    a security boundary anyway (AR-6). The server checks only that the invitee is
    real and active and that the colour is a free palette entry.
    """
    with repo.calendar_transaction(calendar_id) as calendar:
        invitee = next((i for i in calendar.invitees if i.id == invitee_id), None)
        if invitee is None or invitee.removed_at is not None:
            raise FileNotFoundError(invitee_id)

        if colour not in PALETTE:
            raise ValueError("That colour is not in the palette")
        # Tombstones included: a removed person's colour stays theirs while their
        # name still renders on past days (AR-7).
        taken = {i.color for i in calendar.invitees if i.id != invitee_id}
        if colour in taken:
            raise ValueError("Someone else already has that colour")

        invitee.color = colour
        calendar.updated_at = now_iso()
        return calendar


# ── Votes ────────────────────────────────────────────────────────────────────


def set_vote(calendar_id: str, invitee_id: str, day: str, status: str) -> Calendar:
    """Set one person's answer for one day.

    Narrow on purpose (AR-5): the request says only who, when and what, so the
    write is small, the lock is held briefly, and a lost update is not
    expressible in the API at all.

    **Not admin-gated** — voting is the thing guests are here to do. The server
    checks that the invitee is real and active and that the day is not past; the
    claim saying *which* invitee you are was never a security boundary (AR-6).
    """
    try:
        parsed = date.fromisoformat(day)
    except ValueError as exc:
        raise ValueError("Date must be YYYY-MM-DD") from exc

    if parsed < today():
        raise ValueError("That day has already been and gone")

    with repo.calendar_transaction(calendar_id) as calendar:
        invitee = next((i for i in calendar.invitees if i.id == invitee_id), None)
        if invitee is None:
            raise FileNotFoundError(invitee_id)
        if invitee.removed_at is not None:
            raise ValueError("That person is no longer on this calendar")

        if status == "none":
            calendar.votes.get(day, {}).pop(invitee_id, None)
        else:
            calendar.votes.setdefault(day, {})[invitee_id] = status

        # A date nobody is on is dropped rather than kept as an empty map, so
        # `votes` never accumulates dead keys.
        if day in calendar.votes and not calendar.votes[day]:
            del calendar.votes[day]

        calendar.updated_at = now_iso()
        return calendar
