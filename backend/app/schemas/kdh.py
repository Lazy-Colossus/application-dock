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
    color: str
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


class Me(BaseModel):
    username: str
    is_admin: bool


class CreateCalendarRequest(BaseModel):
    name: str
    invitee_names: list[str]


class UpdateCalendarRequest(BaseModel):
    name: str


class AddInviteeRequest(BaseModel):
    name: str


class RecolourInviteeRequest(BaseModel):
    color: str
