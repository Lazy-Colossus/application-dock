"""Kalendariq business logic — shared availability calendars.

Raises stdlib exceptions only (`FileNotFoundError`, `ValueError`,
`PermissionError`); the router translates them. Never raises `HTTPException`.

This module currently holds the helpers the later stories share; calendar CRUD
and the admin gate arrive with the first endpoints in Story 1.3.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, date, datetime

from app.core.config import settings
from app.repositories import kalendariq_repo as repo
from app.schemas.kalendariq import NOTE_MAX_LENGTH, Calendar, CalendarSummary, Invitee


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


def new_share_token() -> str:
    """The secret in an invitee link.

    Long because it is the ONLY thing standing between the public internet and
    writing to this calendar — there is no second factor and no account behind
    it. `token_urlsafe(24)` is 192 bits, which is not guessable and still fits
    in a link somebody pastes into a group chat.
    """
    return secrets.token_urlsafe(24)


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
    return username not in settings.kalendariq_guest_usernames


def require_admin(username: str) -> None:
    """Raise `PermissionError` if `username` is a guest. The router maps it to 403."""
    if not is_admin(username):
        raise PermissionError("This action is only available to an admin.")


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
        invitees.append(Invitee(id=new_id("inv"), name=name, order=order))
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
        share_token=new_share_token(),
    )
    repo.write_calendar(calendar)
    return calendar


def get_calendar(calendar_id: str) -> Calendar:
    """One calendar. Raises FileNotFoundError if unknown, ValueError if malformed."""
    calendar = repo.read_calendar(calendar_id)
    if calendar.share_token:
        return calendar

    # Made before invitee links existed. Minted once and persisted, rather than
    # defaulted in the schema: a token generated fresh on every read would give
    # a different link each time the page loaded, and every link already shared
    # would stop working on the next write.
    with repo.calendar_transaction(calendar_id) as stored:
        if not stored.share_token:
            stored.share_token = new_share_token()
        return stored


def get_shared_calendar(token: str) -> Calendar:
    """The calendar an invitee link points at.

    The token IS the authorisation — there is no user on this path. Everything
    reachable with it is scoped to one calendar, and the destructive verbs
    (rename, delete, roster, chosen days) are not exposed to it at all.
    """
    return repo.find_by_share_token(token)


def list_calendar_summaries() -> list[CalendarSummary]:
    """Every calendar, newest first, as the landing list needs it.

    Shared, not per-user: admins and guests see exactly the same list.
    """
    summaries = []
    for calendar in repo.list_calendars():
        # Made before invitee links existed: mint one now so the list can offer
        # the link, rather than showing a row whose share button does nothing.
        if not calendar.share_token:
            calendar = get_calendar(calendar.id)
        # Tombstoned invitees are off the roster (AR-7), so they neither count
        # nor appear.
        roster = sorted(_active(calendar), key=lambda i: i.order)
        boundary = today().isoformat()
        upcoming = [d for d in calendar.chosen_dates if d >= boundary]
        past = [d for d in calendar.chosen_dates if d < boundary]
        summaries.append(
            CalendarSummary(
                id=calendar.id,
                name=calendar.name,
                invitee_count=len(roster),
                invitee_names=[i.name for i in roster],
                created_at=calendar.created_at,
                # Dates sort lexically because they are all YYYY-MM-DD, so the
                # nearest upcoming is the first and the most recent past is the
                # last (AR-4, NFR-5).
                next_session=min(upcoming) if upcoming else None,
                last_session=max(past) if past else None,
                share_token=calendar.share_token,
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
    person's name is reusable, because "they came back" is a real case.
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
      is tombstoned with `removed_at`, keeping their name so past cells still
      render them (AR-7).
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


# ── Votes ────────────────────────────────────────────────────────────────────


def _parse_future_day(day: str) -> date:
    """A well-formed date that has not been and gone. Shared by votes and notes."""
    try:
        parsed = date.fromisoformat(day)
    except ValueError as exc:
        raise ValueError("Date must be YYYY-MM-DD") from exc
    if parsed < today():
        raise ValueError("That day has already been and gone")
    return parsed


def _active_invitee(calendar: Calendar, invitee_id: str) -> None:
    """Raise unless `invitee_id` is on the roster and has not been removed."""
    invitee = next((i for i in calendar.invitees if i.id == invitee_id), None)
    if invitee is None:
        raise FileNotFoundError(invitee_id)
    if invitee.removed_at is not None:
        raise ValueError("That person is no longer on this calendar")


def set_vote(calendar_id: str, invitee_id: str, day: str, status: str) -> Calendar:
    """Set one person's answer for one day.

    Narrow on purpose (AR-5): the request says only who, when and what, so the
    write is small, the lock is held briefly, and a lost update is not
    expressible in the API at all.

    **Not admin-gated** — voting is the thing guests are here to do. The server
    checks that the invitee is real and active and that the day is not past; the
    claim saying *which* invitee you are was never a security boundary (AR-6).
    """
    _parse_future_day(day)

    with repo.calendar_transaction(calendar_id) as calendar:
        _active_invitee(calendar, invitee_id)

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


# ── Chosen days ──────────────────────────────────────────────────────────────


def set_chosen(username: str, calendar_id: str, day: str, chosen: bool) -> Calendar:
    """Mark or unmark the day the group settled on. Admin only.

    Unlike voting, this is **allowed on a past day**: it is a record of what
    happened, and a record may be corrected after the fact (FR-16, FR-17).
    """
    require_admin(username)

    try:
        date.fromisoformat(day)
    except ValueError as exc:
        raise ValueError("Date must be YYYY-MM-DD") from exc

    with repo.calendar_transaction(calendar_id) as calendar:
        marked = set(calendar.chosen_dates)
        if chosen:
            marked.add(day)
        else:
            marked.discard(day)
        calendar.chosen_dates = sorted(marked)
        calendar.updated_at = now_iso()
        return calendar


def set_votes_bulk(
    calendar_id: str,
    invitee_id: str,
    days: list[str],
    status: str,
    clear_notes: bool = False,
) -> Calendar:
    """Set one person's answer across many days, in a single transaction.

    All or nothing: every date is validated before anything is written, so a
    selection containing one bad day leaves the calendar untouched rather than
    half-applied. One transaction also means one lock rather than N, which
    matters when this is how a person answers a whole month at once (NFR-1).

    `clear_notes` drops the person's notes on those days as well. It is off by
    default because a note usually outlives the vote it came with — saying "away
    that week" belongs with a "Can't", not deleted by it. Only clearing a whole
    month, which erases your presence on those days outright, passes it.
    """
    if not days:
        raise ValueError("No days selected")
    for day in days:
        _parse_future_day(day)

    with repo.calendar_transaction(calendar_id) as calendar:
        _active_invitee(calendar, invitee_id)

        for day in days:
            if status == "none":
                calendar.votes.get(day, {}).pop(invitee_id, None)
            else:
                calendar.votes.setdefault(day, {})[invitee_id] = status
            if day in calendar.votes and not calendar.votes[day]:
                del calendar.votes[day]

            if clear_notes:
                calendar.notes.get(day, {}).pop(invitee_id, None)
                if day in calendar.notes and not calendar.notes[day]:
                    del calendar.notes[day]

        calendar.updated_at = now_iso()
        return calendar


# ── Notes ────────────────────────────────────────────────────────────────────


def set_note(calendar_id: str, invitee_id: str, day: str, text: str) -> Calendar:
    """Attach a short note to one person's day, or clear it with blank text.

    Deliberately independent of the vote: someone who cannot come may still say
    why, and that is exactly when a note is most useful — which is why the day
    sheet lists a person who has a note even when they have no answer.

    Not gated on who you claim to be: everyone shares a login, so the claim was
    never a boundary and pretending otherwise here would be theatre (AR-6).
    """
    _parse_future_day(day)

    cleaned = text.strip()
    if len(cleaned) > NOTE_MAX_LENGTH:
        raise ValueError(f"A note is at most {NOTE_MAX_LENGTH} characters")

    with repo.calendar_transaction(calendar_id) as calendar:
        _active_invitee(calendar, invitee_id)

        if cleaned:
            calendar.notes.setdefault(day, {})[invitee_id] = cleaned
        else:
            calendar.notes.get(day, {}).pop(invitee_id, None)
        if day in calendar.notes and not calendar.notes[day]:
            del calendar.notes[day]

        calendar.updated_at = now_iso()
        return calendar
