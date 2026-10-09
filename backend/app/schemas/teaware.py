"""Pydantic v2 schemas for the Teaware Cabinet.

Teaware lives inside the cabinet's tea doc (see `app/schemas/tea.py`), so a
shared cabinet shares its ware, and deleting a pot clears it from the sessions
that name it in the same atomic write.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, PositiveInt

from app.schemas.tea_session import TeaSession

TeawareType = Literal["gaiwan", "pot", "kyusu", "shiboridashi", "chawan", "pitcher", "cup", "other"]
TeawareMaterial = Literal["porcelain", "clay", "clay_glazed", "stoneware", "glass", "other"]

# What a session can be brewed in. Pitchers and cups join a sitting with the Cha
# Xi Journal, not the timer.
BREWING_TYPES: frozenset[str] = frozenset(
    {"gaiwan", "pot", "kyusu", "shiboridashi", "chawan", "other"}
)


class Teaware(BaseModel):
    id: str
    name: str
    type: TeawareType
    material: TeawareMaterial | None = None
    volume_ml: int | None = None
    porous: bool = False
    dedicated_node_id: str | None = None
    maker: str = ""
    origin: str = ""
    acquired_date: str | None = None
    price_paid: float | None = None
    notes: str = ""
    image_url: str | None = None
    retired_at: str | None = None
    created_at: str
    updated_at: str


class TeawareWriteRequest(BaseModel):
    """The body for both create and replace: `Teaware` minus server fields, plus `retired`."""

    name: str
    type: TeawareType
    material: TeawareMaterial | None = None
    volume_ml: PositiveInt | None = None
    porous: bool = False
    dedicated_node_id: str | None = None
    maker: str = ""
    origin: str = ""
    acquired_date: str | None = None
    price_paid: float | None = Field(default=None, ge=0)
    notes: str = ""
    retired: bool = False


class TeawareUsage(BaseModel):
    """A piece's finished sessions, newest first, and how many strayed from its dedication."""

    sessions: list[TeaSession]
    total: int
    off_dedication: int
