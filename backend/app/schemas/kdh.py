"""KDH schemas — shared availability calendars.

One document per calendar. Unlike the other apps, nothing here is scoped by
user: the group votes behind a single shared login, so a calendar is identified
by its id alone.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# "yes" is freely available; "if_needed" is "I can make this work if it's the day
# that saves the session". Every other state — declined, undecided, never looked
# — is represented by ABSENCE, so nothing is stored for the common case.
VoteStatus = Literal["yes", "if_needed"]


class Invitee(BaseModel):
    id: str
    name: str
    order: int
    # Set when an admin removes them. The record survives so past day cells can
    # still render their name and colour, and their colour stays reserved while
    # it does (AR-7). `None` means active.
    removed_at: str | None = None


class Calendar(BaseModel):
    schema_version: int
    id: str
    name: str
    created_at: str
    created_by: str  # audit only; confers no ongoing rights (AR-2)
    updated_at: str
    invitees: list[Invitee] = Field(default_factory=list)
    # date (YYYY-MM-DD) -> invitee id -> status. Keyed by date because the month
    # view reads a cell at a time; a date with an empty map is pruned (AR-4).
    votes: dict[str, dict[str, VoteStatus]] = Field(default_factory=dict)
    # date -> invitee id -> a short note. Same shape as `votes` and pruned the
    # same way. A note is independent of an answer: someone who cannot come may
    # still say why, and someone free may add a caveat.
    notes: dict[str, dict[str, str]] = Field(default_factory=dict)
    # Admin-marked days, ascending. Any number: a long-running calendar
    # accumulates them, and they survive into the past (FR-17).
    chosen_dates: list[str] = Field(default_factory=list)


class CalendarSummary(BaseModel):
    """A calendar as the landing list needs it — never the full vote map.

    Carries the active invitees' names as well as their count: the list shows
    who is invited, and fetching each calendar to find out would be a request
    per row.
    """

    id: str
    name: str
    invitee_count: int
    invitee_names: list[str]
    created_at: str
    # The next chosen day still to come, and the most recent one already past.
    # Both are sent so the row can say "next" or fall back to "last" without
    # needing to compare dates itself.
    next_session: str | None = None
    last_session: str | None = None


class Me(BaseModel):
    username: str
    is_admin: bool
    # The client must never decide "past" from its own clock (NFR-5), and this
    # is the request every page already makes — so the boundary rides along
    # rather than costing a second round trip.
    today: str


class CreateCalendarRequest(BaseModel):
    name: str
    invitee_names: list[str]


class UpdateCalendarRequest(BaseModel):
    name: str


class AddInviteeRequest(BaseModel):
    name: str


VOTE_STATUSES = ("yes", "if_needed", "none")


class SetVoteRequest(BaseModel):
    invitee_id: str
    date: str
    # "none" is not a stored status — it clears the vote. Absence is how "not
    # available" is represented (AR-4).
    status: Literal["yes", "if_needed", "none"]


class SetChosenRequest(BaseModel):
    date: str
    chosen: bool


NOTE_MAX_LENGTH = 200


class SetNoteRequest(BaseModel):
    invitee_id: str
    date: str
    # Blank clears the note. There is no separate delete.
    text: str


class SetVotesBulkRequest(BaseModel):
    invitee_id: str
    dates: list[str]
    status: Literal["yes", "if_needed", "none"]
    # Opt-in, and defaults off: answering "Can't" across a run of days must KEEP
    # the note saying why, which is exactly when a note earns its place. Only
    # "clear my month", which erases your presence outright, asks for this.
    clear_notes: bool = False
