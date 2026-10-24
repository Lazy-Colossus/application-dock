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
    # Connect port configured for this instance, or None if not set yet.
    port: int | None = None


class AmpConfig(BaseModel):
    public_ip: str | None = None


class PortsPayload(BaseModel):
    ports: dict[str, int]
