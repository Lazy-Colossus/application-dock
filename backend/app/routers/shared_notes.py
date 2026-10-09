"""Shared Notes API router.

Notes owned by one user and optionally shared with other dock users. Every
route is scoped to the authenticated caller via `get_current_user` — the
username identifies who is asking and picks which notes they may see (Stories
1.2–1.3). Endpoints land in Story 1.3; this scaffold only mounts the prefix
behind auth.
"""

from fastapi import APIRouter, Depends

from app.core.dependencies import get_current_user

router = APIRouter(
    prefix="/api/shared-notes",
    tags=["shared-notes"],
    dependencies=[Depends(get_current_user)],
)
