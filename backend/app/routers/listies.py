"""Listies API router.

Per-user sheets of typed columns. Every route is scoped to the authenticated
user via `get_current_user`; the username selects the on-disk file (never taken
from request input).
"""

from fastapi import APIRouter

router = APIRouter(prefix="/api/listies", tags=["listies"])
