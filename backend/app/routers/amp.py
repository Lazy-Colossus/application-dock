"""AMP Instances HTTP layer.

Translates amp_service's stdlib-style exceptions to HTTP: not-configured -> 503,
AMP upstream failure (unreachable / login rejected / call refused) -> 502. Port
config is a separate concern handled by amp_ports_service.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_user, require_app
from app.schemas.amp import AmpConfig, Instance, PortsPayload
from app.services import amp_ports_service, amp_service

router = APIRouter(prefix="/api/amp", tags=["amp"], dependencies=[Depends(require_app("amp"))])


@router.get("/instances", response_model=list[Instance])
def list_instances(_: str = Depends(get_current_user)) -> list[Instance]:
    try:
        instances = amp_service.list_instances()
    except amp_service.AmpNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except amp_service.AmpUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    # Prune ports for instances that no longer exist, then join the survivors.
    ports = amp_ports_service.reconcile([inst.id for inst in instances])
    for inst in instances:
        inst.port = ports.get(inst.id)
    return instances


@router.get("/config", response_model=AmpConfig)
def get_config(_: str = Depends(get_current_user)) -> AmpConfig:
    """Hand the SPA the public IP at runtime, so it is never built into the bundle."""
    return AmpConfig(public_ip=amp_ports_service.public_ip())


@router.put("/ports", response_model=PortsPayload)
def put_ports(payload: PortsPayload, _: str = Depends(get_current_user)) -> PortsPayload:
    try:
        stored = amp_ports_service.set_ports(payload.ports)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return PortsPayload(ports=stored)


@router.post("/instances/{instance_id}/start", status_code=202)
def start_instance(instance_id: str, _: str = Depends(get_current_user)) -> dict[str, str]:
    try:
        amp_service.start_instance(instance_id)
    except amp_service.AmpNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except amp_service.AmpUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"detail": "Instance start requested"}
