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


def test_create_share_returns_a_token(as_user) -> None:
    created = _upload("x.html")
    response = client.post(f"/api/pagemage/pages/{created['id']}/share")
    assert response.status_code == 200, response.text
    assert response.json()["share_token"]


def test_public_raw_view_needs_no_auth_and_returns_html(as_user) -> None:
    created = _upload("x.html", b"<h1>Hello</h1>")
    token = client.post(f"/api/pagemage/pages/{created['id']}/share").json()["share_token"]
    # No auth override cleared on purpose — the public route ignores auth anyway.
    response = client.get(f"/api/pagemage/share/{token}/raw")
    assert response.status_code == 200
    assert response.text == "<h1>Hello</h1>"
    assert "text/html" in response.headers["content-type"]
    assert response.headers["content-security-policy"] == "sandbox allow-scripts allow-forms"


def test_public_raw_view_unknown_token_is_404(as_user) -> None:
    response = client.get("/api/pagemage/share/nope/raw")
    assert response.status_code == 404


def test_revoke_makes_the_link_404(as_user) -> None:
    created = _upload("x.html")
    token = client.post(f"/api/pagemage/pages/{created['id']}/share").json()["share_token"]
    assert client.get(f"/api/pagemage/share/{token}/raw").status_code == 200
    del_resp = client.delete(f"/api/pagemage/pages/{created['id']}/share")
    assert del_resp.status_code == 200
    assert del_resp.json()["share_token"] == ""
    assert client.get(f"/api/pagemage/share/{token}/raw").status_code == 404


def test_list_reports_shared_after_share(as_user) -> None:
    created = _upload("x.html")
    client.post(f"/api/pagemage/pages/{created['id']}/share")
    summary = next(p for p in client.get("/api/pagemage/pages").json() if p["id"] == created["id"])
    assert summary["shared"] is True


def test_upload_with_name_field_uses_it(as_user) -> None:
    response = client.post(
        "/api/pagemage/pages",
        files={"file": ("report.html", b"<p>x</p>", "text/html")},
        data={"name": "Custom Title"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Custom Title"


def test_rename_changes_the_name(as_user) -> None:
    created = _upload("x.html")
    response = client.put(f"/api/pagemage/pages/{created['id']}/name", json={"name": "Renamed"})
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Renamed"


def test_rename_blank_is_422(as_user) -> None:
    created = _upload("x.html")
    response = client.put(f"/api/pagemage/pages/{created['id']}/name", json={"name": "  "})
    assert response.status_code == 422


def test_rename_missing_is_404(as_user) -> None:
    response = client.put("/api/pagemage/pages/p-missing1/name", json={"name": "x"})
    assert response.status_code == 404


def test_delete_removes_the_page(as_user) -> None:
    created = _upload("x.html")
    response = client.delete(f"/api/pagemage/pages/{created['id']}")
    assert response.status_code == 204
    assert client.get(f"/api/pagemage/pages/{created['id']}").status_code == 404


def test_delete_missing_is_404(as_user) -> None:
    response = client.delete("/api/pagemage/pages/p-missing1")
    assert response.status_code == 404
