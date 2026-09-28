"""Tea Cabinet API router.

A cabinet of teas, classified against a shared catalogue tree, that household
members may share. Every route is scoped to the authenticated user via
`get_current_user`; the username resolves the caller's cabinet and is never
taken from request input.

This module is the only place tea exceptions become HTTP: `FileNotFoundError`
-> 404, `ValueError` -> 422 also on a session whose vessel can't be brewed in,
`NodeInUseError` and `SessionFinalisedError` -> 409, `CabinetGoneError` -> 410
on every route, via `_TeaRoute`, `PermissionError` -> 403 on `/cabinet`
membership refusals. `AutofillNotConfiguredError` / `LabelScanNotConfiguredError`
-> 503 and their upstream errors -> 502.
"""

from collections.abc import Callable, Coroutine
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from fastapi.routing import APIRoute

from app.core.dependencies import get_current_user, user_from_token
from app.schemas.almanac import AlmanacEntryView
from app.schemas.tea import (
    AddMemberRequest,
    AutofillRequest,
    AutofillSuggestion,
    CabinetView,
    CatalogueNode,
    CreateNodeRequest,
    LabelScanSuggestion,
    TeaView,
    TeaWriteRequest,
)
from app.schemas.tea_session import BrewingCurve, TeaSession, TeaSessionWrite
from app.schemas.teaware import Teaware, TeawareUsage, TeawareWriteRequest
from app.services import almanac_service
from app.services import tea_autofill_service as autofill
from app.services import tea_cabinet_service as cabinets
from app.services import tea_catalogue_service as catalogue
from app.services import tea_curve_service as curves
from app.services import tea_label_scan_service as label_scan
from app.services import tea_service as service
from app.services import tea_session_service as sessions
from app.services import tea_teaware_service as teaware


class _TeaRoute(APIRoute):
    """Turns a stale cabinet into 410 on every tea route, so no handler repeats it.

    Not 409: the timer reads a 409 on finish as "already finished" and clears it.
    """

    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        handler = super().get_route_handler()

        async def guarded(request: Request) -> Response:
            try:
                return await handler(request)
            except cabinets.CabinetGoneError as exc:
                raise HTTPException(
                    status_code=410, detail="Your cabinet changed — reload"
                ) from exc

        return guarded


router = APIRouter(prefix="/api/tea", tags=["tea"], route_class=_TeaRoute)

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


@router.post("/scan-label", response_model=LabelScanSuggestion)
async def scan_tea_label(
    file: Annotated[UploadFile, File()],
    current_user: str = Depends(get_current_user),
) -> LabelScanSuggestion:
    content = await file.read()
    try:
        # The SDK call is blocking; keep it off the event loop.
        return await run_in_threadpool(
            label_scan.scan, current_user, content, file.content_type or ""
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except label_scan.LabelScanNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except label_scan.LabelScanUpstreamError as exc:
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


@router.get("/sessions", response_model=list[TeaSession])
def list_sessions(
    status: Literal["in_progress"], current_user: str = Depends(get_current_user)
) -> list[TeaSession]:
    # Only the recovery check lists across teas; finished sessions are read per tea.
    return sessions.list_in_progress(current_user)


@router.put("/sessions/{session_id}", response_model=TeaSession)
def upsert_session(
    session_id: str,
    req: TeaSessionWrite,
    current_user: str = Depends(get_current_user),
) -> TeaSession:
    try:
        return sessions.upsert(current_user, session_id, req)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Tea not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except sessions.SessionFinalisedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.delete("/sessions/{session_id}", status_code=204)
def discard_session(session_id: str, current_user: str = Depends(get_current_user)) -> None:
    try:
        sessions.discard(current_user, session_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except sessions.SessionFinalisedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/teas/{tea_id}/sessions", response_model=list[TeaSession])
def list_tea_sessions(
    tea_id: str, current_user: str = Depends(get_current_user)
) -> list[TeaSession]:
    try:
        return sessions.list_for_tea(current_user, tea_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Tea not found") from exc


@router.get("/teas/{tea_id}/curve", response_model=BrewingCurve)
def get_curve(tea_id: str, current_user: str = Depends(get_current_user)) -> BrewingCurve:
    try:
        return curves.curve_for(current_user, tea_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Tea not found") from exc


@router.get("/cabinet", response_model=CabinetView)
def get_cabinet(current_user: str = Depends(get_current_user)) -> CabinetView:
    return cabinets.get_cabinet(current_user)


@router.post("/cabinet/members", response_model=CabinetView)
def add_cabinet_member(
    req: AddMemberRequest, current_user: str = Depends(get_current_user)
) -> CabinetView:
    try:
        return cabinets.add_member(current_user, req.username)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/cabinet/members/{username}", response_model=CabinetView)
def remove_cabinet_member(
    username: str, current_user: str = Depends(get_current_user)
) -> CabinetView:
    try:
        return cabinets.remove_member(current_user, username)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Member not found") from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/teaware", response_model=list[Teaware])
def list_teaware(current_user: str = Depends(get_current_user)) -> list[Teaware]:
    return teaware.list_teaware(current_user)


@router.post("/teaware", response_model=Teaware, status_code=201)
def create_teaware(
    req: TeawareWriteRequest, current_user: str = Depends(get_current_user)
) -> Teaware:
    try:
        return teaware.create_teaware(current_user, req)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


# Declared before `/teaware/{teaware_id}`, which would otherwise read "last-used" as an id.
@router.get("/teaware/last-used", response_model=Teaware | None)
def last_used_teaware(
    tea_id: str | None = None, current_user: str = Depends(get_current_user)
) -> Teaware | None:
    return teaware.last_used(current_user, tea_id)


@router.get("/teaware/{teaware_id}", response_model=Teaware)
def get_teaware(teaware_id: str, current_user: str = Depends(get_current_user)) -> Teaware:
    try:
        return teaware.get_teaware(current_user, teaware_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Teaware not found") from exc


@router.put("/teaware/{teaware_id}", response_model=Teaware)
def replace_teaware(
    teaware_id: str,
    req: TeawareWriteRequest,
    current_user: str = Depends(get_current_user),
) -> Teaware:
    try:
        return teaware.replace_teaware(current_user, teaware_id, req)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Teaware not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/teaware/{teaware_id}", status_code=204)
def delete_teaware(teaware_id: str, current_user: str = Depends(get_current_user)) -> None:
    try:
        teaware.delete_teaware(current_user, teaware_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Teaware not found") from exc


@router.post("/teaware/{teaware_id}/image", response_model=Teaware, status_code=201)
async def upload_teaware_image(
    teaware_id: str,
    file: Annotated[UploadFile, File()],
    current_user: str = Depends(get_current_user),
) -> Teaware:
    content = await file.read()
    try:
        return teaware.save_image(current_user, teaware_id, content, file.content_type or "")
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Teaware not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/teaware/{teaware_id}/image")
def get_teaware_image(teaware_id: str, token: str = Query(...)) -> FileResponse:
    """`?token=` for the same reason as tea photos: an `<img>` can't send a header."""
    current_user = user_from_token(token)
    try:
        path = teaware.image_path(current_user, teaware_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Image not found") from exc
    media_type = _IMAGE_MEDIA_TYPES.get(path.suffix.removeprefix("."), "application/octet-stream")
    return FileResponse(path, media_type=media_type)


@router.delete("/teaware/{teaware_id}/image", response_model=Teaware)
def delete_teaware_image(teaware_id: str, current_user: str = Depends(get_current_user)) -> Teaware:
    try:
        return teaware.delete_image(current_user, teaware_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Teaware not found") from exc


@router.get("/teaware/{teaware_id}/usage", response_model=TeawareUsage)
def teaware_usage(teaware_id: str, current_user: str = Depends(get_current_user)) -> TeawareUsage:
    try:
        return teaware.usage(current_user, teaware_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Teaware not found") from exc
