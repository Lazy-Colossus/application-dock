"""Business logic for PageMage.

Raises stdlib exceptions only — the router translates them into HTTP responses.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime
from pathlib import PurePosixPath, PureWindowsPath

from app.repositories import pagemage_repo as repo
from app.schemas.pagemage import Page, PageSummary

_MAX_BYTES = 2 * 1024 * 1024  # 2 MB
_ALLOWED_SUFFIXES = (".html", ".htm")


def now_iso() -> str:
    """ISO-8601 UTC stamp with millisecond precision.

    Millisecond precision because `created_at` sorts the page list and two
    uploads inside one second would otherwise tie into arbitrary order.
    """
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def new_id() -> str:
    return f"p-{uuid.uuid4().hex[:8]}"


def _base_filename(filename: str) -> str:
    """The last path segment, tolerating both `/` and `\\` separators.

    An upload's filename can arrive with a client path; take just the name.
    """
    return PureWindowsPath(PurePosixPath(filename).name).name


def _derive_name(filename: str) -> str:
    stem = _base_filename(filename)
    for suffix in _ALLOWED_SUFFIXES:
        if stem.lower().endswith(suffix):
            stem = stem[: -len(suffix)]
            break
    stem = stem.strip()
    return stem or "Untitled page"


def create_page(user: str, filename: str, raw: bytes, name: str | None = None) -> Page:
    """Validate an uploaded HTML file and persist it as a new page.

    `name` is the user-facing title; a blank/omitted name falls back to the
    filename.
    """
    if len(raw) > _MAX_BYTES:
        raise ValueError("file too large (max 2 MB)")
    base = _base_filename(filename).lower()
    if not base.endswith(_ALLOWED_SUFFIXES):
        raise ValueError("only .html or .htm files are supported")
    try:
        html = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("file must be UTF-8 text") from exc
    stamp = now_iso()
    page = Page(
        id=new_id(),
        name=(name.strip() if name and name.strip() else _derive_name(filename)),
        html=html,
        created_at=stamp,
        updated_at=stamp,
    )
    repo.write_page(user, page)
    return page


def list_pages(user: str) -> list[PageSummary]:
    """All of `user`'s pages as summaries, newest first."""
    pages = repo.list_pages_for(user)
    pages.sort(key=lambda p: p.created_at, reverse=True)
    return [
        PageSummary(
            id=p.id,
            name=p.name,
            shared=bool(p.share_token),
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
        for p in pages
    ]


def get_page(user: str, page_id: str) -> Page:
    """Load one of `user`'s pages, or raise `FileNotFoundError`."""
    page = repo.read_page(user, page_id)
    if page is None:
        raise FileNotFoundError(f"page not found: {page_id}")
    return page


def update_html(user: str, page_id: str, html: str) -> Page:
    """Replace a page's HTML (the persisted field edits) and restamp it."""
    page = get_page(user, page_id)
    page.html = html
    page.updated_at = now_iso()
    repo.write_page(user, page)
    return page


def new_share_token() -> str:
    """The secret in a share link — 192 bits, not guessable, URL-safe."""
    return secrets.token_urlsafe(24)


def create_share(user: str, page_id: str) -> Page:
    """Mint a share token for the page if it has none; return the page.

    Idempotent: an already-shared page keeps its token, so the link is stable.
    """
    page = get_page(user, page_id)
    if not page.share_token:
        page.share_token = new_share_token()
        repo.write_page(user, page)
    return page


def revoke_share(user: str, page_id: str) -> Page:
    """Clear the page's share token so the old link stops resolving."""
    page = get_page(user, page_id)
    page.share_token = ""
    repo.write_page(user, page)
    return page


def rename_page(user: str, page_id: str, name: str) -> Page:
    """Change a page's user-facing name; reject a blank name."""
    cleaned = name.strip()
    if not cleaned:
        raise ValueError("name must not be blank")
    page = get_page(user, page_id)
    page.name = cleaned
    page.updated_at = now_iso()
    repo.write_page(user, page)
    return page


def delete_page(user: str, page_id: str) -> None:
    """Delete a page, or raise `FileNotFoundError` if it does not exist."""
    get_page(user, page_id)  # raises FileNotFoundError if absent
    repo.delete_page(user, page_id)


def get_shared_page(token: str) -> Page:
    """The page behind a share token, or raise `FileNotFoundError`.

    The token IS the authorisation — there is no user on this path. An empty or
    unknown token is the same `FileNotFoundError`, so nothing reveals whether a
    page exists.
    """
    page = repo.find_by_share_token(token)
    if page is None:
        raise FileNotFoundError("shared page not found")
    return page
