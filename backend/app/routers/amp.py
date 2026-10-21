"""AMP Instances HTTP layer.

Translates amp_service's stdlib-style exceptions to HTTP: not-configured -> 503,
AMP upstream failure (unreachable / login rejected / call refused) -> 502.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_user, require_app
from app.schemas.amp import Instance
from app.services import amp_service

router = APIRouter(prefix="/api/amp", tags=["amp"], dependencies=[Depends(require_app("amp"))])


@router.get("/instances", response_model=list[Instance])
def list_instances(_: str = Depends(get_current_user)) -> list[Instance]:
    try:
        return amp_service.list_instances()
    except amp_service.AmpNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except amp_service.AmpUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/instances/{instance_id}/start", status_code=202)
def start_instance(instance_id: str, _: str = Depends(get_current_user)) -> dict[str, str]:
    try:
        amp_service.start_instance(instance_id)
    except amp_service.AmpNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except amp_service.AmpUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"detail": "Instance start requested"}
