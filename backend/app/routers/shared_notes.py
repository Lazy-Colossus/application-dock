"""Shared Notes API router.

Notes are documents with a membership list, not per-user files: every route is
scoped to the authenticated user via `get_current_user`, and that username is
what decides which notes exist as far as the caller is concerned. Endpoints
land in Story 1.3; the router is mounted from the start so its prefix is
reachable.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/api/shared-notes", tags=["shared-notes"])
