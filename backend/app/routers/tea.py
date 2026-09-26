"""Tea Cabinet API router.

A per-user cabinet of teas, classified against a shared catalogue tree. Every
route is scoped to the authenticated user via `get_current_user`; the username
selects the on-disk document and is never taken from request input.

This module is the only place tea exceptions become HTTP: `FileNotFoundError`
-> 404, `ValueError` -> 422, `NodeInUseError` -> 409.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from app.core.dependencies import get_current_user, user_from_token
from app.schemas.almanac import AlmanacEntryView
from app.schemas.tea import (
    AutofillRequest,
    AutofillSuggestion,
    CatalogueNode,
    CreateNodeRequest,
    TeaView,
    TeaWriteRequest,
)
from app.services import almanac_service
from app.services import tea_autofill_service as autofill
from app.services import tea_catalogue_service as catalogue
from app.services import tea_service as service

router = APIRouter(prefix="/api/tea", tags=["tea"])

_IMAGE_MEDIA_TYPES = {
    "jpg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "gif": "image/gif",
}


@router.get("/catalogue", response_model=list[CatalogueNode])
def list_catalogue(current_user: str = Depends(get_current_user)) -> list[CatalogueNode]:
    # Flat, with parent_id — the client builds the tree once for the picker
    # and the response stays trivially cacheable (AR-4).
    return catalogue.merged_nodes(current_user)


@router.post("/catalogue", response_model=CatalogueNode, status_code=201)
def create_catalogue_node(
    req: CreateNodeRequest,
    current_user: str = Depends(get_current_user),
) -> CatalogueNode:
    try:
        return catalogue.create_node(current_user, req)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/catalogue/{node_id}", status_code=204)
def delete_catalogue_node(node_id: str, current_user: str = Depends(get_current_user)) -> None:
    try:
        catalogue.delete_node(current_user, node_id)
    except catalogue.NodeInUseError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Catalogue entry not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/teas", response_model=list[TeaView])
def list_teas(current_user: str = Depends(get_current_user)) -> list[TeaView]:
    return service.list_teas(current_user)


@router.post("/teas", response_model=TeaView, status_code=201)
def create_tea(req: TeaWriteRequest, current_user: str = Depends(get_current_user)) -> TeaView:
    try:
        return service.create_tea(current_user, req)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/teas/{tea_id}", response_model=TeaView)
def get_tea(tea_id: str, current_user: str = Depends(get_current_user)) -> TeaView:
    try:
        return service.get_tea(current_user, tea_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Tea not found") from exc


@router.put("/teas/{tea_id}", response_model=TeaView)
def replace_tea(
    tea_id: str,
    req: TeaWriteRequest,
    current_user: str = Depends(get_current_user),
) -> TeaView:
    try:
        return service.replace_tea(current_user, tea_id, req)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Tea not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/teas/{tea_id}", status_code=204)
def delete_tea(tea_id: str, current_user: str = Depends(get_current_user)) -> None:
    try:
        service.delete_tea(current_user, tea_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Tea not found") from exc


@router.post("/teas/{tea_id}/image", response_model=TeaView, status_code=201)
async def upload_tea_image(
    tea_id: str,
    file: Annotated[UploadFile, File()],
    current_user: str = Depends(get_current_user),
) -> TeaView:
    content = await file.read()
    try:
        return service.save_image(current_user, tea_id, content, file.content_type or "")
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Tea not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/teas/{tea_id}/image")
def get_tea_image(tea_id: str, token: str = Query(...)) -> FileResponse:
    """Authenticated via `?token=` because an `<img>` tag cannot send an
    `Authorization` header — verified with the same logic as the bearer path.
    """
    current_user = user_from_token(token)
    try:
        path = service.image_path(current_user, tea_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Image not found") from exc
    media_type = _IMAGE_MEDIA_TYPES.get(path.suffix.removeprefix("."), "application/octet-stream")
    return FileResponse(path, media_type=media_type)


@router.delete("/teas/{tea_id}/image", response_model=TeaView)
def delete_tea_image(tea_id: str, current_user: str = Depends(get_current_user)) -> TeaView:
    try:
        return service.delete_image(current_user, tea_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Tea not found") from exc


@router.post("/autofill", response_model=AutofillSuggestion | None)
def autofill_tea(
    req: AutofillRequest, current_user: str = Depends(get_current_user)
) -> AutofillSuggestion | None:
    try:
        return autofill.suggest(current_user, req.name)
    except autofill.AutofillNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except autofill.AutofillUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/almanac", response_model=list[AlmanacEntryView])
def list_almanac(
    country: str | None = None,
    q: str | None = None,
    current_user: str = Depends(get_current_user),
) -> list[AlmanacEntryView]:
    return almanac_service.list_entries(current_user, country=country, q=q)


@router.get("/almanac/{catalogue_node_id}", response_model=AlmanacEntryView)
def get_almanac_entry(
    catalogue_node_id: str, current_user: str = Depends(get_current_user)
) -> AlmanacEntryView:
    try:
        return almanac_service.get_entry(current_user, catalogue_node_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Almanac entry not found") from exc
