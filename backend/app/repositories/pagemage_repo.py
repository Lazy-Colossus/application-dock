"""Filesystem persistence for PageMage — one JSON file per page.

The ONLY code in this app that touches the filesystem for pages. All writes go
through the atomic write-then-rename helper. Pages are per-user, under
`pagemage/users/{user}/pages/`, mirroring `progress_repo`'s per-user layout.

The page `id` is validated as a safe bare filename (as in `shared_notes_repo`)
so a crafted id can never escape the pages directory.

Layering: callers MUST be services. Routers do not call this directly.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.core.config import settings
from app.core.storage import atomic_write_json
from app.schemas.pagemage import Page

_APP_DIR = "pagemage"


def _validate_page_id(page_id: str) -> str:
    """Ensure `page_id` is a safe bare filename, never a path.

    Ids are minted as `p-{hex8}` and never contain a dot, so rejecting any `.`
    kills both `..` traversal and `foo.json` collisions on one check.
    """
    if not page_id or not page_id.strip():
        raise ValueError("page_id must be non-empty")
    if page_id != page_id.strip():
        raise ValueError("page_id must not have surrounding whitespace")
    if "/" in page_id or "\\" in page_id or "." in page_id:
        raise ValueError(f"unsafe page_id: {page_id!r}")
    return page_id


def _pages_dir(user: str) -> Path:
    return settings.data_dir / _APP_DIR / "users" / user / "pages"


def _page_path(user: str, page_id: str) -> Path:
    _validate_page_id(page_id)
    return _pages_dir(user) / f"{page_id}.json"


def read_page(user: str, page_id: str) -> Page | None:
    """Read one page, or `None` if it has no file yet."""
    path = _page_path(user, page_id)
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None
    return Page.model_validate(json.loads(raw))


def write_page(user: str, page: Page) -> None:
    """Persist a page atomically, creating the user's pages dir on first write."""
    atomic_write_json(_page_path(user, page.id), page.model_dump(mode="json"))


def list_pages_for(user: str) -> list[Page]:
    """Every page owned by `user`. Scans the user's pages directory."""
    directory = _pages_dir(user)
    if not directory.is_dir():
        return []
    return [
        Page.model_validate(json.loads(path.read_text(encoding="utf-8")))
        for path in sorted(directory.glob("*.json"))
    ]


def _users_dir() -> Path:
    return settings.data_dir / _APP_DIR / "users"


def find_by_share_token(token: str) -> Page | None:
    """The page carrying `token`, scanning every user's pages. `None` if none.

    No user context exists on the public share path, so this walks
    `pagemage/users/*/pages/*.json`. An empty `token` never matches (pages that
    were never shared also carry an empty token).
    """
    if not token:
        return None
    users = _users_dir()
    if not users.is_dir():
        return None
    for user_dir in sorted(users.iterdir()):
        pages = user_dir / "pages"
        if not pages.is_dir():
            continue
        for path in sorted(pages.glob("*.json")):
            page = Page.model_validate(json.loads(path.read_text(encoding="utf-8")))
            if page.share_token == token:
                return page
    return None
