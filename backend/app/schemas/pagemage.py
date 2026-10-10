"""Pydantic v2 schemas for PageMage.

One JSON file per page at `DATA_DIR/pagemage/users/{user}/pages/{id}.json`.
The uploaded HTML lives in the `html` string field; metadata rides alongside
it. `name` is the user-facing title, derived from the uploaded filename.
"""

from __future__ import annotations

from pydantic import BaseModel


class Page(BaseModel):
    """A page as persisted and as the viewer sees it (HTML included)."""

    schema_version: int = 1
    id: str
    name: str
    html: str
    share_token: str = ""
    created_at: str
    updated_at: str


class PageSummary(BaseModel):
    """A page as the home list sees it — no HTML, so the list stays cheap."""

    id: str
    name: str
    shared: bool = False
    created_at: str
    updated_at: str


class UpdateHtmlRequest(BaseModel):
    html: str
