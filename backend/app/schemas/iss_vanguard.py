"""Schemas for the ISS Vanguard resource tracker.

The five resources and three tiers are fixed by the game, so they are literal
types: an unknown key in a request is a validation error, not new data. Every
grid is normalised to all fifteen cells, so no code downstream has to treat a
missing cell as zero.
"""

from __future__ import annotations

from typing import Annotated, Literal, get_args

from pydantic import AfterValidator, BaseModel, Field, NonNegativeInt

Resource = Literal[
    "microorganisms",
    "alien_technologies",
    "minerals",
    "strange_flora",
    "living_specimens",
]
Tier = Literal["basic", "rare", "very_rare"]

RESOURCES: tuple[Resource, ...] = get_args(Resource)
TIERS: tuple[Tier, ...] = get_args(Tier)


def _complete(grid: dict[Resource, dict[Tier, int]]) -> dict[Resource, dict[Tier, int]]:
    return {r: {t: grid.get(r, {}).get(t, 0) for t in TIERS} for r in RESOURCES}


Grid = Annotated[dict[Resource, dict[Tier, NonNegativeInt]], AfterValidator(_complete)]


def empty_grid() -> dict[Resource, dict[Tier, int]]:
    return _complete({})


def is_empty_grid(grid: dict[Resource, dict[Tier, int]]) -> bool:
    return all(count == 0 for row in grid.values() for count in row.values())


class Project(BaseModel):
    id: str
    code: str
    name: str = ""
    prerequisite_id: str | None = None
    cost: Grid = Field(default_factory=empty_grid)
    done: bool = False


class ShipDoc(BaseModel):
    """One ship on disk. Membership lives in `memberships.json`, never here."""

    id: str
    owner: str
    rev: int = 0
    stock: Grid = Field(default_factory=empty_grid)
    projects: list[Project] = Field(default_factory=list)


class ShipView(BaseModel):
    """The caller's ship. `id` is None while they own an implicit empty one."""

    id: str | None
    owner: str
    members: list[str]
    is_owner: bool
    rev: int
    stock: Grid
    projects: list[Project]


class StockAdjustRequest(BaseModel):
    resource: Resource
    tier: Tier
    delta: Literal[-1, 1]


class ProjectWriteRequest(BaseModel):
    code: str
    name: str = ""
    prerequisite_id: str | None = None
    cost: Grid = Field(default_factory=empty_grid)


class AddMemberRequest(BaseModel):
    username: str
