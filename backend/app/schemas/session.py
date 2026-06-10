"""Session-related Pydantic schemas.

Wire format matches `architecture.md#Data Architecture` exactly. All JSON
fields are snake_case; integers are stored as ints (never strings); dates
are ISO 8601 strings (never Unix timestamps).
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

# Spec: FR-2.8. Any value not in this set is rejected at the schema layer.
VALID_SHOT_VALUES: frozenset[int] = frozenset({0, 5, 8, 10, 11})

# Spec: FR-2.5. Targets are numbered 1..18 inclusive.
TARGET_NUMBER_MIN = 1
TARGET_NUMBER_MAX = 18

# Spec: SessionData.created is an ISO 8601 UTC timestamp with trailing Z.
# Example: "2026-05-28T14:00:00Z".
_ISO_8601_UTC_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$")

# Spec: SessionData.date is the calendar date used for ordering (Story 6.6).
# Always YYYY-MM-DD, independent of the user-facing `name`.
_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


SessionStatus = Literal["in_progress", "finalised"]


class TargetScores(BaseModel):
    """Shot record for a single target across all archers in a session.

    The `scores` dict is keyed by archer name (unique per session per FR-2.2)
    and maps to exactly two shots per archer. Mid-session a shot may be `None`
    ("not yet entered"); `0` is a real shot value, distinct from `None`
    (Story 7.1). `confirmed` is the source of truth for the green board state.
    """

    number: int = Field(ge=TARGET_NUMBER_MIN, le=TARGET_NUMBER_MAX)
    scores: dict[str, list[int | None]]
    confirmed: bool = False

    @field_validator("scores")
    @classmethod
    def _validate_scores(cls, value: dict[str, list[int | None]]) -> dict[str, list[int | None]]:
        for archer, shots in value.items():
            if len(shots) != 2:
                raise ValueError(f"archer {archer!r} must have exactly 2 shots, got {len(shots)}")
            for shot in shots:
                if shot is not None and shot not in VALID_SHOT_VALUES:
                    raise ValueError(
                        f"archer {archer!r} has invalid shot value {shot}; "
                        f"allowed values are {sorted(VALID_SHOT_VALUES)} or null"
                    )
        return value


class SessionData(BaseModel):
    """One archery session, persisted as a JSON file."""

    label: str
    name: str
    date: str
    created: str
    status: SessionStatus
    archers: list[str]
    targets: list[TargetScores] = Field(default_factory=list)

    @field_validator("created")
    @classmethod
    def _validate_created_iso8601(cls, value: str) -> str:
        if not _ISO_8601_UTC_RE.match(value):
            raise ValueError(
                "created must be ISO 8601 UTC with trailing Z, e.g. 2026-05-28T14:00:00Z"
            )
        return value

    @field_validator("date")
    @classmethod
    def _validate_date(cls, value: str) -> str:
        if not _ISO_DATE_RE.match(value):
            raise ValueError("date must be YYYY-MM-DD, e.g. 2026-05-29")
        return value

    @field_validator("archers", mode="before")
    @classmethod
    def _trim_archer_names(cls, value: object) -> object:
        # Normalize whitespace before uniqueness/non-empty checks so " Alice "
        # and "Alice" are treated identically.
        if isinstance(value, list):
            return [v.strip() if isinstance(v, str) else v for v in value]
        return value

    @field_validator("archers")
    @classmethod
    def _validate_archers(cls, value: list[str]) -> list[str]:
        if len(value) < 1:
            raise ValueError("session must have at least one archer")
        for name in value:
            if not isinstance(name, str) or name == "":
                raise ValueError("archer names must be non-empty strings")
        if len({v.lower() for v in value}) != len(value):
            raise ValueError("archer names must be unique within a session")
        return value

    @model_validator(mode="after")
    def _validate_targets(self) -> SessionData:
        # Story 7.1: in-progress sessions are lenient — a target may cover only
        # part of the roster and shots may be null (mid-entry). Finalised
        # sessions are strict: every present target must cover the full roster
        # with two real (non-null) shots each. Stray archers are always rejected.
        roster = set(self.archers)
        for target in self.targets:
            keys = set(target.scores.keys())
            extra = keys - roster
            if extra:
                raise ValueError(f"target {target.number}: stray archers {sorted(extra)}")

            if self.status == "finalised":
                missing = roster - keys
                if missing:
                    raise ValueError(
                        f"target {target.number}: finalised session missing "
                        f"scores for {sorted(missing)}"
                    )
                for archer, shots in target.scores.items():
                    if any(shot is None for shot in shots):
                        raise ValueError(
                            f"target {target.number}: finalised session has a "
                            f"null shot for {archer!r}"
                        )
        return self


class CreateSessionRequest(BaseModel):
    """POST /api/archery/sessions request body (consumed in Story 2.2).

    Validation mirrors `SessionData.archers` so the same rules apply at the
    HTTP boundary. `name` is optional; the service defaults it to the label
    (the date) when omitted or blank (Story 6.2/6.6).
    """

    archers: list[str]
    name: str | None = None

    @field_validator("archers", mode="before")
    @classmethod
    def _trim_archer_names(cls, value: object) -> object:
        if isinstance(value, list):
            return [v.strip() if isinstance(v, str) else v for v in value]
        return value

    @field_validator("archers")
    @classmethod
    def _validate_archers(cls, value: list[str]) -> list[str]:
        if len(value) < 1:
            raise ValueError("must include at least one archer")
        for name in value:
            if not isinstance(name, str) or name == "":
                raise ValueError("archer names must be non-empty strings")
        if len({v.lower() for v in value}) != len(value):
            raise ValueError("archer names must be unique")
        return value


class AddPlayerRequest(BaseModel):
    """POST /api/archery/players request body (Story 8.2)."""

    name: str

    @field_validator("name", mode="before")
    @classmethod
    def _trim(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("name")
    @classmethod
    def _non_empty(cls, value: str) -> str:
        if value == "":
            raise ValueError("player name must be non-empty")
        if "/" in value:
            raise ValueError("player name must not contain '/'")
        return value


class SessionSummary(BaseModel):
    """One row in GET /api/archery/sessions (consumed in Story 4.1).

    Winner + winning_score are computed by `archery_service.py`, not the
    schema. Tie-breaking rule (alphabetical, case-insensitive) is enforced
    in the service per Story 4.1 v0.2.
    """

    label: str
    name: str
    archer_count: int
    winner: str
    winning_score: int


class InProgressSummary(BaseModel):
    """One row in GET /api/archery/sessions/in-progress (Story 6.1).

    Lightweight listing for the home screen / resume picker. The full session
    is fetched by label via GET /api/archery/sessions/in-progress/{label}.
    """

    label: str
    name: str
    date: str
    confirmed_targets: int
