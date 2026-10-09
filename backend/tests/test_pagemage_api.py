"""Integration tests for the PageMage endpoints.

The caller always comes from the JWT (overridden to `test_user` by conftest),
never from request input. `as_user` switches identity to prove per-user
isolation.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.dependencies import get_current_user
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)


@pytest.fixture
def as_user() -> Iterator[object]:
    def _switch(username: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: username

    _switch("ana")
    yield _switch
    app.dependency_overrides[get_current_user] = lambda: "test_user"


def _upload(name: str = "demo.html", body: bytes = b"<p>hi</p>") -> dict:
    response = client.post(
        "/api/pagemage/pages",
        files={"file": (name, body, "text/html")},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_upload_returns_summary_without_html(as_user) -> None:
    data = _upload("Report.html")
    assert data["name"] == "Report"
    assert "html" not in data
    assert data["id"].startswith("p-")


def test_upload_rejects_non_html(as_user) -> None:
    response = client.post(
        "/api/pagemage/pages",
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert response.status_code == 400


def test_list_returns_uploaded_pages(as_user) -> None:
    _upload("a.html")
    _upload("b.html")
    response = client.get("/api/pagemage/pages")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_list_is_per_user(as_user) -> None:
    as_user("ana")
    _upload("ana.html")
    as_user("bob")
    response = client.get("/api/pagemage/pages")
    assert response.json() == []


def test_get_returns_full_html(as_user) -> None:
    created = _upload("x.html", b"<h1>Hello</h1>")
    response = client.get(f"/api/pagemage/pages/{created['id']}")
    assert response.status_code == 200
    assert response.json()["html"] == "<h1>Hello</h1>"


def test_get_missing_is_404(as_user) -> None:
    response = client.get("/api/pagemage/pages/p-missing1")
    assert response.status_code == 404


def test_put_persists_edited_html(as_user) -> None:
    created = _upload("x.html", b"<input value='old'>")
    response = client.put(
        f"/api/pagemage/pages/{created['id']}",
        json={"html": "<input value='new'>"},
    )
    assert response.status_code == 200
    assert response.json()["html"] == "<input value='new'>"
    # And the change is durable.
    again = client.get(f"/api/pagemage/pages/{created['id']}")
    assert again.json()["html"] == "<input value='new'>"


def test_put_missing_is_404(as_user) -> None:
    response = client.put("/api/pagemage/pages/p-missing1", json={"html": "<p>x</p>"})
    assert response.status_code == 404
