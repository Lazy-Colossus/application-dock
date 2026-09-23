"""Epic 1 — capture, browse, read, edit and delete, through the real API.

The load-bearing assertion in this file is the verbatim body contract: whatever
else changes, the pasted text must come back character for character (FR-5,
NFR-3).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.dependencies import get_current_user
from app.main import app

client = TestClient(app)

# A paste straight off a recipe site: mixed bullets, ragged breaks, blank lines,
# inconsistent capitals and a stray boilerplate line at the end.
MESSY_BODY = """Pumpkin Dal

- 1 small pumpkin
* 200g red lentils
• 2 tsp cumin
– a thumb of ginger

Method
1. Soften the ONION.
2. Everything else in.


3. Simmer 40 min.

Print Recipe"""


@pytest.fixture(autouse=True)
def isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr("app.core.config.settings.data_dir", tmp_path)
    return tmp_path


def create(name: str = "Pumpkin dal", body: str = "Simmer.", **extra: object) -> dict:
    resp = client.post("/api/kitchencraft/recipes", json={"name": name, "body": body, **extra})
    assert resp.status_code == 200, resp.text
    return resp.json()


# -- Story 1.3: capture ------------------------------------------------------


def test_a_name_and_a_body_alone_are_enough_to_save() -> None:
    recipe = create()
    assert recipe["id"].startswith("r-")
    assert recipe["name"] == "Pumpkin dal"
    assert recipe["body"] == "Simmer."
    # Everything optional is absent, not zero and not a placeholder.
    assert recipe["meal_type"] is None
    assert recipe["total_time_minutes"] is None
    assert recipe["servings"] is None
    assert recipe["source"] is None
    assert recipe["tags"] == []
    assert recipe["ingredients"] == []
    assert recipe["favourite"] is False


def test_a_saved_recipe_appears_in_the_collection() -> None:
    create()
    listed = client.get("/api/kitchencraft/recipes").json()
    assert [r["name"] for r in listed] == ["Pumpkin dal"]


def test_an_empty_name_is_rejected_and_the_error_names_it() -> None:
    resp = client.post("/api/kitchencraft/recipes", json={"name": "   ", "body": "Simmer."})
    assert resp.status_code == 422
    assert "name" in resp.json()["detail"]


def test_an_empty_body_is_rejected_and_the_error_names_it() -> None:
    resp = client.post("/api/kitchencraft/recipes", json={"name": "Dal", "body": "\n \n"})
    assert resp.status_code == 422
    assert "body" in resp.json()["detail"]


def test_a_rejected_save_stores_nothing() -> None:
    client.post("/api/kitchencraft/recipes", json={"name": "", "body": "Simmer."})
    assert client.get("/api/kitchencraft/recipes").json() == []


def test_the_body_is_stored_verbatim_apart_from_trimmed_ends() -> None:
    recipe = create(body=f"\n\n  {MESSY_BODY}  \n\n")
    assert recipe["body"] == MESSY_BODY

    fetched = client.get(f"/api/kitchencraft/recipes/{recipe['id']}").json()
    assert fetched["body"] == MESSY_BODY
    # Spelled out, because this is the one thing the app must never do: no
    # bullet normalisation, no re-casing, no collapsing of the blank run.
    assert "- 1 small pumpkin" in fetched["body"]
    assert "* 200g red lentils" in fetched["body"]
    assert "• 2 tsp cumin" in fetched["body"]
    assert "– a thumb of ginger" in fetched["body"]
    assert "Soften the ONION." in fetched["body"]
    assert "\n\n\n" in fetched["body"]
    assert fetched["body"].endswith("Print Recipe")


def test_created_and_updated_timestamps_are_iso_8601_and_start_equal() -> None:
    recipe = create()
    assert recipe["created_at"] == recipe["updated_at"]
    assert recipe["created_at"].endswith("+00:00")


# -- Story 1.4: browse -------------------------------------------------------


def test_an_empty_collection_is_an_empty_list_not_an_error() -> None:
    resp = client.get("/api/kitchencraft/recipes")
    assert resp.status_code == 200
    assert resp.json() == []


def test_the_collection_is_newest_first() -> None:
    for name in ("first", "second", "third"):
        create(name=name)
    listed = client.get("/api/kitchencraft/recipes").json()
    assert [r["name"] for r in listed] == ["third", "second", "first"]


def test_every_user_sees_the_one_shared_collection() -> None:
    app.dependency_overrides[get_current_user] = lambda: "nell"
    create(name="Nell's dal")
    app.dependency_overrides[get_current_user] = lambda: "bram"
    create(name="Bram's traybake")

    expected = ["Bram's traybake", "Nell's dal"]
    assert [r["name"] for r in client.get("/api/kitchencraft/recipes").json()] == expected
    app.dependency_overrides[get_current_user] = lambda: "nell"
    assert [r["name"] for r in client.get("/api/kitchencraft/recipes").json()] == expected


def test_a_recipe_one_user_saved_another_can_open_and_edit() -> None:
    app.dependency_overrides[get_current_user] = lambda: "nell"
    recipe = create()
    app.dependency_overrides[get_current_user] = lambda: "bram"
    assert client.get(f"/api/kitchencraft/recipes/{recipe['id']}").status_code == 200
    resp = client.put(f"/api/kitchencraft/recipes/{recipe['id']}", json={"favourite": True})
    assert resp.json()["favourite"] is True


def test_signing_in_is_still_required(monkeypatch: pytest.MonkeyPatch) -> None:
    # A configured secret, so the dev escape hatch cannot answer for an anonymous
    # caller and turn the 401 into a 200.
    monkeypatch.setattr("app.core.config.settings.jwt_secret_key", "test-secret-key-for-tests-only")
    app.dependency_overrides.pop(get_current_user, None)
    assert client.get("/api/kitchencraft/recipes").status_code == 401


# -- Story 1.5: read, edit, delete -------------------------------------------


def test_an_unknown_recipe_id_is_a_404_with_a_detail_string() -> None:
    resp = client.get("/api/kitchencraft/recipes/r-nope")
    assert resp.status_code == 404
    assert isinstance(resp.json()["detail"], str)


def test_editing_a_field_persists_it_and_advances_updated_at() -> None:
    recipe = create()
    resp = client.put(
        f"/api/kitchencraft/recipes/{recipe['id']}",
        json={"name": "Pumpkin dal, the good one"},
    )
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["name"] == "Pumpkin dal, the good one"
    assert updated["updated_at"] > recipe["updated_at"]
    assert updated["created_at"] == recipe["created_at"]


def test_editing_anything_but_the_body_leaves_the_body_byte_identical() -> None:
    recipe = create(body=MESSY_BODY)
    client.put(
        f"/api/kitchencraft/recipes/{recipe['id']}",
        json={
            "name": "Renamed",
            "meal_type": "dinner",
            "total_time_minutes": 40,
            "servings": 4,
            "source": "a magazine",
            "tags": ["batch cooking"],
            "favourite": True,
        },
    )
    assert client.get(f"/api/kitchencraft/recipes/{recipe['id']}").json()["body"] == MESSY_BODY


def test_an_update_to_an_unknown_id_is_a_404() -> None:
    assert client.put("/api/kitchencraft/recipes/r-nope", json={"name": "x"}).status_code == 404


def test_an_update_with_no_fields_is_rejected() -> None:
    recipe = create()
    resp = client.put(f"/api/kitchencraft/recipes/{recipe['id']}", json={})
    assert resp.status_code == 422


def test_an_update_cannot_blank_the_name_or_the_body() -> None:
    recipe = create()
    for field in ("name", "body"):
        resp = client.put(f"/api/kitchencraft/recipes/{recipe['id']}", json={field: "  "})
        assert resp.status_code == 422
        assert field in resp.json()["detail"]


def test_an_unchanged_update_does_not_advance_updated_at() -> None:
    """Re-saving the same values is not an edit, so the timestamp stays put."""
    recipe = create(meal_type="dinner")
    again = client.put(
        f"/api/kitchencraft/recipes/{recipe['id']}", json={"meal_type": "dinner"}
    ).json()
    assert again["updated_at"] == recipe["updated_at"]


def test_delete_removes_the_recipe_from_the_collection() -> None:
    recipe = create()
    assert client.delete(f"/api/kitchencraft/recipes/{recipe['id']}").status_code == 204
    assert client.get("/api/kitchencraft/recipes").json() == []
    assert client.get(f"/api/kitchencraft/recipes/{recipe['id']}").status_code == 404


def test_deleting_an_unknown_id_is_a_404() -> None:
    assert client.delete("/api/kitchencraft/recipes/r-nope").status_code == 404


def test_delete_leaves_the_other_recipes_alone() -> None:
    keep = create(name="keep")
    drop = create(name="drop")
    client.delete(f"/api/kitchencraft/recipes/{drop['id']}")
    assert [r["id"] for r in client.get("/api/kitchencraft/recipes").json()] == [keep["id"]]
