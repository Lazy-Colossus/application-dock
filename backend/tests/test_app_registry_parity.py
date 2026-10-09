"""The two app registries must agree.

`GET /api/apps` and `frontend/src/apps/registry.ts` both describe the dock's
apps, and CLAUDE.md's "Adding a new app" says to update both. Nothing enforced
that, and they drifted: Story 9.2 moved the archery icon to `adjust` in the
frontend and left the backend on `sports_score` for months, because only the
frontend list is what actually renders the landing page — so the backend copy
can be wrong without anyone seeing it.

This reads the TypeScript source as text rather than importing it. That is the
trade for having the check at all from Python; it is a test, so a parse that
stops matching fails loudly and visibly rather than silently passing.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

_REGISTRY_TS = Path(__file__).resolve().parents[2] / "frontend" / "src" / "apps" / "registry.ts"

# `id: "archery"` and friends, inside one object literal of the `apps` array.
_FIELD = re.compile(r'(\w+)\s*:\s*"([^"]*)"')
_LINE_COMMENT = re.compile(r"//[^\n]*")


def _frontend_registry() -> list[dict[str, str]]:
    """Parse the app descriptors out of `registry.ts`."""
    source = _REGISTRY_TS.read_text(encoding="utf-8")

    marker = "export const apps: AppDescriptor[] = ["
    assert marker in source, f"{_REGISTRY_TS.name} no longer declares `apps` as expected"
    body = source[source.index(marker) + len(marker) :]
    body = body[: body.index("\n];")]

    # Comments carry prose, not fields — strip them so none is mistaken for one.
    entries = [
        dict(_FIELD.findall(_LINE_COMMENT.sub("", block)))
        for block in re.findall(r"\{(.*?)\}", body, re.S)
    ]
    parsed = [e for e in entries if e]
    assert parsed, f"parsed no app entries from {_REGISTRY_TS.name} — has its shape changed?"
    return parsed


@pytest.fixture
def frontend_apps() -> list[dict[str, str]]:
    if not _REGISTRY_TS.is_file():
        pytest.skip("frontend source not present in this checkout")
    return _frontend_registry()


@pytest.fixture
def backend_apps() -> list[dict[str, str]]:
    response = client.get("/api/apps")
    assert response.status_code == 200
    return response.json()


def test_the_registries_list_the_same_apps(backend_apps, frontend_apps) -> None:
    back = {a["id"] for a in backend_apps}
    front = {a["id"] for a in frontend_apps}
    assert back == front, (
        f"only in the backend: {sorted(back - front)}; "
        f"only in the frontend: {sorted(front - back)}"
    )


def test_every_descriptor_field_agrees(backend_apps, frontend_apps) -> None:
    """The check that would have caught the archery icon drift."""
    front = {a["id"]: a for a in frontend_apps}

    # Only ids both lists carry: a missing app is the other test's report, and
    # reaching for it here would raise a KeyError instead of saying anything.
    mismatches = [
        f"{a['id']}.{field}: backend={a[field]!r} frontend={front[a['id']][field]!r}"
        for a in backend_apps
        if a["id"] in front
        for field in ("label", "icon", "route")
        if a[field] != front[a["id"]][field]
    ]
    assert not mismatches, "app registries disagree:\n  " + "\n  ".join(mismatches)


def test_the_registries_are_in_the_same_order(backend_apps, frontend_apps) -> None:
    """Order is the card order on the landing page, so it is part of the contract."""
    assert [a["id"] for a in backend_apps] == [a["id"] for a in frontend_apps]


def test_a_route_matches_its_id(backend_apps) -> None:
    """A typo'd route sends the card nowhere; both lists would share the typo."""
    for descriptor in backend_apps:
        assert descriptor["route"] == f"/{descriptor['id']}"
