"""Response shape for the AMP Instances app.

This is the app's own contract to the frontend, not AMP's raw API shape —
`amp_service` maps AMP's fields onto this.
"""

from __future__ import annotations

from pydantic import BaseModel


class Instance(BaseModel):
    id: str
    name: str
    module: str
    running: bool
    state: str
    active_users: int | None = None
    max_users: int | None = None
