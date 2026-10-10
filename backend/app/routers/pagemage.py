"""PageMage API router.

Every route is scoped to the authenticated user via `get_current_user`; that
username decides which pages exist as far as the caller is concerned. Exception
mapping lives here and nowhere below: `FileNotFoundError → 404`,
`ValueError → 400` for uploads (bad file) and `422` for a bad update body.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile

from app.core.dependencies import get_current_user
from app.schemas.pagemage import Page, PageSummary, UpdateHtmlRequest
from app.services import pagemage_service as service

router = APIRouter(prefix="/api/pagemage", tags=["pagemage"])


@router.get("/pages", response_model=list[PageSummary])
def list_pages(current_user: str = Depends(get_current_user)) -> list[PageSummary]:
    return service.list_pages(current_user)


@router.post("/pages", response_model=PageSummary)
async def upload_page(
    file: Annotated[UploadFile, File()],
    current_user: str = Depends(get_current_user),
) -> PageSummary:
    raw = await file.read()
    try:
        page = service.create_page(current_user, file.filename or "", raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return PageSummary(
        id=page.id, name=page.name, created_at=page.created_at, updated_at=page.updated_at
    )


@router.get("/pages/{page_id}", response_model=Page)
def get_page(page_id: str, current_user: str = Depends(get_current_user)) -> Page:
    try:
        return service.get_page(current_user, page_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Page not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/pages/{page_id}", response_model=Page)
def update_page(
    page_id: str,
    req: UpdateHtmlRequest,
    current_user: str = Depends(get_current_user),
) -> Page:
    try:
        return service.update_html(current_user, page_id, req.html)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Page not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/pages/{page_id}/share", response_model=Page)
def create_share(page_id: str, current_user: str = Depends(get_current_user)) -> Page:
    try:
        return service.create_share(current_user, page_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Page not found") from exc


@router.delete("/pages/{page_id}/share", response_model=Page)
def revoke_share(page_id: str, current_user: str = Depends(get_current_user)) -> Page:
    try:
        return service.revoke_share(current_user, page_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Page not found") from exc


# Unauthenticated by design — the share link. The token in the path IS the
# authorisation; an unknown, empty, or revoked token is a 404 with no detail,
# so nothing reveals whether a page exists. Mirrors kalendariq.share_router.
share_router = APIRouter(prefix="/api/pagemage/share", tags=["pagemage-share"])


@share_router.get("/{token}/raw")
def view_shared_raw(token: str) -> Response:
    try:
        page = service.get_shared_page(token)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Not found") from exc
    # CSP `sandbox` forces an opaque origin: scripts/forms run, but the served
    # HTML cannot reach this origin's cookies, localStorage, or the app's JWT.
    return Response(
        content=page.html,
        media_type="text/html; charset=utf-8",
        headers={"Content-Security-Policy": "sandbox allow-scripts allow-forms"},
    )
