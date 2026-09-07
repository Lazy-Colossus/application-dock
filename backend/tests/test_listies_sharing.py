"""Tests for shared sheets and the sharing lifecycle (Story 5.1).

Covers the shared store (repo), the resolver access matrix, the owner-only
sharing lifecycle, and that content operations behave identically on a shared
sheet as on a private one (bumping `rev`).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.dependencies import get_current_user
from app.main import app
from app.repositories import listies_repo
from app.schemas.listies import SharedSheetDoc, Sheet, Tab
from app.services import auth_service

client = TestClient(app)

COLS = [
    {"name": "Item", "type": "text"},
    {"name": "Qty", "type": "number"},
]


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    # Every repo imports the same settings singleton, so one patch is enough;
    # give the roster three real users so share targets validate.
    for name in ("alice", "bob", "carol"):
        auth_service.create_user(name)


def as_user(username: str) -> None:
    """Route subsequent requests through `username` (overrides the auth dep)."""
    app.dependency_overrides[get_current_user] = lambda: username


def make_sheet(owner: str, name: str = "Trip") -> str:
    as_user(owner)
    resp = client.post("/api/listies/sheets", json={"name": name, "columns": COLS})
    assert resp.status_code == 200
    return resp.json()["id"]


def share(owner: str, sheet_id: str, usernames: list[str]):
    as_user(owner)
    return client.post(f"/api/listies/sheets/{sheet_id}/share", json={"usernames": usernames})


# ── repo: shared store round-trip & path safety ─────────────────────────────────


def _doc(sheet_id: str = "s-abc") -> SharedSheetDoc:
    sheet = Sheet(
        id=sheet_id, name="S", created_at="2026-09-04T00:00:00Z", tabs=[Tab(id="tb-1", name="T")]
    )
    return SharedSheetDoc(
        sheet=sheet,
        owner="alice",
        members=["alice", "bob"],
        rev=3,
        created_at="2026-09-04T00:00:00Z",
        updated_at="2026-09-04T00:00:00Z",
    )


def test_shared_store_round_trips() -> None:
    listies_repo.write_shared(_doc())
    back = listies_repo.read_shared("s-abc")
    assert back is not None
    assert back.owner == "alice"
    assert back.members == ["alice", "bob"]
    assert back.rev == 3
    assert back.sheet.id == "s-abc"


def test_read_shared_missing_is_none() -> None:
    assert listies_repo.read_shared("s-nope") is None


def test_delete_shared_is_idempotent() -> None:
    listies_repo.write_shared(_doc())
    listies_repo.delete_shared("s-abc")
    listies_repo.delete_shared("s-abc")  # no error the second time
    assert listies_repo.read_shared("s-abc") is None


def test_list_shared_for_filters_by_membership() -> None:
    listies_repo.write_shared(_doc("s-1"))  # members alice, bob
    other = _doc("s-2")
    other.members = ["alice", "carol"]
    listies_repo.write_shared(other)
    assert {d.sheet.id for d in listies_repo.list_shared_for("bob")} == {"s-1"}
    assert {d.sheet.id for d in listies_repo.list_shared_for("alice")} == {"s-1", "s-2"}
    assert listies_repo.list_shared_for("dave") == []


@pytest.mark.parametrize("bad", ["../escape", "a/b", "a\\b", ".", "..", ""])
def test_shared_path_rejects_unsafe_sheet_id(bad: str) -> None:
    with pytest.raises(ValueError):
        listies_repo._shared_path(bad)


# ── sharing lifecycle ───────────────────────────────────────────────────────────


def test_share_promotes_sheet_out_of_owner_doc(tmp_path: Path) -> None:
    sheet_id = make_sheet("alice")
    resp = share("alice", sheet_id, ["bob"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["shared"] is True
    assert body["owner"] == "alice"
    assert body["members"] == ["alice", "bob"]
    assert body["can_manage"] is True

    # It now lives in the shared store...
    assert listies_repo.read_shared(sheet_id) is not None
    # ...and is gone from alice's user doc.
    assert listies_repo.read_doc("alice").sheets == []


def test_reshare_unions_members() -> None:
    sheet_id = make_sheet("alice")
    share("alice", sheet_id, ["bob"])
    body = share("alice", sheet_id, ["bob", "carol"]).json()
    assert body["members"] == ["alice", "bob", "carol"]


def test_owner_is_always_first_and_deduped() -> None:
    sheet_id = make_sheet("alice")
    body = share("alice", sheet_id, ["alice", "bob", "bob"]).json()
    assert body["members"] == ["alice", "bob"]


def test_remove_member_revokes_access() -> None:
    sheet_id = make_sheet("alice")
    share("alice", sheet_id, ["bob"])

    as_user("bob")
    assert client.get(f"/api/listies/sheets/{sheet_id}").status_code == 200

    as_user("alice")
    resp = client.delete(f"/api/listies/sheets/{sheet_id}/share/bob")
    assert resp.status_code == 200
    assert resp.json()["members"] == ["alice"]

    as_user("bob")
    assert client.get(f"/api/listies/sheets/{sheet_id}").status_code == 404


def test_removing_last_non_owner_leaves_shared_with_only_owner() -> None:
    sheet_id = make_sheet("alice")
    share("alice", sheet_id, ["bob"])
    as_user("alice")
    body = client.delete(f"/api/listies/sheets/{sheet_id}/share/bob").json()
    assert body["shared"] is True
    assert body["members"] == ["alice"]
    assert listies_repo.read_shared(sheet_id) is not None


def test_stop_sharing_demotes_without_deleting() -> None:
    sheet_id = make_sheet("alice")
    share("alice", sheet_id, ["bob"])
    as_user("alice")
    resp = client.delete(f"/api/listies/sheets/{sheet_id}/share")
    assert resp.status_code == 200
    assert resp.json()["shared"] is False

    # Back in alice's private doc, shared file gone, sheet still exists.
    assert listies_repo.read_shared(sheet_id) is None
    assert [s.id for s in listies_repo.read_doc("alice").sheets] == [sheet_id]
    as_user("alice")
    assert client.get(f"/api/listies/sheets/{sheet_id}").status_code == 200


# ── owner-only guards & isolation ───────────────────────────────────────────────


def test_member_cannot_manage_membership_403() -> None:
    sheet_id = make_sheet("alice")
    share("alice", sheet_id, ["bob"])

    as_user("bob")
    assert (
        client.post(
            f"/api/listies/sheets/{sheet_id}/share", json={"usernames": ["carol"]}
        ).status_code
        == 403
    )
    assert client.delete(f"/api/listies/sheets/{sheet_id}/share/alice").status_code == 403
    assert client.delete(f"/api/listies/sheets/{sheet_id}/share").status_code == 403


def test_member_cannot_delete_shared_sheet_403() -> None:
    sheet_id = make_sheet("alice")
    share("alice", sheet_id, ["bob"])
    as_user("bob")
    assert client.delete(f"/api/listies/sheets/{sheet_id}").status_code == 403
    # Owner can.
    as_user("alice")
    assert client.delete(f"/api/listies/sheets/{sheet_id}").status_code == 204
    assert listies_repo.read_shared(sheet_id) is None


def test_non_member_gets_404_not_403() -> None:
    sheet_id = make_sheet("alice")
    share("alice", sheet_id, ["bob"])
    # carol is not a member: identical 404 to a non-existent id, never a 403.
    as_user("carol")
    assert client.get(f"/api/listies/sheets/{sheet_id}").status_code == 404
    assert client.delete(f"/api/listies/sheets/{sheet_id}/share/bob").status_code == 404
    assert client.delete(f"/api/listies/sheets/{sheet_id}/share").status_code == 404
    assert client.get("/api/listies/sheets/s-does-not-exist").status_code == 404


def test_share_unknown_user_is_422_with_no_partial_change() -> None:
    sheet_id = make_sheet("alice")
    resp = share("alice", sheet_id, ["bob", "ghost"])
    assert resp.status_code == 422
    # Nothing promoted: the sheet is still private in alice's doc.
    assert listies_repo.read_shared(sheet_id) is None
    assert [s.id for s in listies_repo.read_doc("alice").sheets] == [sheet_id]


def test_reshare_unknown_user_leaves_members_unchanged() -> None:
    sheet_id = make_sheet("alice")
    share("alice", sheet_id, ["bob"])
    resp = share("alice", sheet_id, ["ghost"])
    assert resp.status_code == 422
    assert listies_repo.read_shared(sheet_id).members == ["alice", "bob"]


def test_remove_owner_is_rejected() -> None:
    sheet_id = make_sheet("alice")
    share("alice", sheet_id, ["bob"])
    as_user("alice")
    assert client.delete(f"/api/listies/sheets/{sheet_id}/share/alice").status_code == 422


# ── listing & view shape ────────────────────────────────────────────────────────


def test_list_sheets_includes_shared_with_owner() -> None:
    private_id = make_sheet("bob", name="Bob private")
    shared_id = make_sheet("alice", name="Shared one")
    share("alice", shared_id, ["bob"])

    as_user("bob")
    body = client.get("/api/listies/sheets").json()
    by_id = {s["id"]: s for s in body}
    assert by_id[private_id]["shared"] is False
    assert by_id[private_id]["owner"] is None
    assert by_id[shared_id]["shared"] is True
    assert by_id[shared_id]["owner"] == "alice"


def test_get_private_sheet_omits_member_data() -> None:
    sheet_id = make_sheet("alice")
    as_user("alice")
    body = client.get(f"/api/listies/sheets/{sheet_id}").json()
    assert body["shared"] is False
    assert body["owner"] is None
    assert body["members"] is None
    assert body["can_manage"] is False


def test_member_view_reports_can_manage_false() -> None:
    sheet_id = make_sheet("alice")
    share("alice", sheet_id, ["bob"])
    as_user("bob")
    body = client.get(f"/api/listies/sheets/{sheet_id}").json()
    assert body["shared"] is True
    assert body["can_manage"] is False
    assert body["owner"] == "alice"
    assert body["rev"] == 0


# ── content ops on a shared sheet ───────────────────────────────────────────────


def _tab_id(username: str, sheet_id: str) -> str:
    as_user(username)
    return client.get(f"/api/listies/sheets/{sheet_id}").json()["tabs"][0]["id"]


def test_member_can_edit_shared_content_and_owner_sees_it() -> None:
    sheet_id = make_sheet("alice")
    share("alice", sheet_id, ["bob"])
    tab_id = _tab_id("alice", sheet_id)

    as_user("bob")
    resp = client.post(f"/api/listies/sheets/{sheet_id}/tabs/{tab_id}/rows", json={"cells": {}})
    assert resp.status_code == 200

    as_user("alice")
    tab = client.get(f"/api/listies/sheets/{sheet_id}").json()["tabs"][0]
    assert len(tab["rows"]) == 1


def test_content_write_bumps_rev() -> None:
    sheet_id = make_sheet("alice")
    share("alice", sheet_id, ["bob"])
    tab_id = _tab_id("alice", sheet_id)

    as_user("bob")
    client.post(f"/api/listies/sheets/{sheet_id}/tabs/{tab_id}/rows", json={"cells": {}})
    assert listies_repo.read_shared(sheet_id).rev == 1
    client.post(f"/api/listies/sheets/{sheet_id}/tabs/{tab_id}/rows", json={"cells": {}})
    assert listies_repo.read_shared(sheet_id).rev == 2


def test_read_does_not_bump_rev() -> None:
    sheet_id = make_sheet("alice")
    share("alice", sheet_id, ["bob"])
    as_user("bob")
    client.get(f"/api/listies/sheets/{sheet_id}")
    client.get(f"/api/listies/sheets/{sheet_id}")
    assert listies_repo.read_shared(sheet_id).rev == 0


def test_two_members_writes_both_persist() -> None:
    sheet_id = make_sheet("alice")
    share("alice", sheet_id, ["bob"])
    tab_id = _tab_id("alice", sheet_id)

    as_user("alice")
    client.post(f"/api/listies/sheets/{sheet_id}/tabs/{tab_id}/rows", json={"cells": {}})
    as_user("bob")
    client.post(f"/api/listies/sheets/{sheet_id}/tabs/{tab_id}/rows", json={"cells": {}})

    doc = listies_repo.read_shared(sheet_id)
    assert len(doc.sheet.tabs[0].rows) == 2
    assert doc.rev == 2


# ── subtractive: a never-shared doc is unaffected ───────────────────────────────


def test_never_shared_user_doc_is_plain_schema_v1(tmp_path: Path) -> None:
    make_sheet("carol")
    raw = json.loads((tmp_path / "listies" / "users" / "carol.json").read_text(encoding="utf-8"))
    assert raw["schema_version"] == 1
    assert len(raw["sheets"]) == 1
    # No collaboration keys leaked into the private per-user document.
    assert "members" not in json.dumps(raw)
    assert "rev" not in raw["sheets"][0]
