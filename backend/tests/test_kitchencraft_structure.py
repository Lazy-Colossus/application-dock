"""Epic 2 (backend half) — optional structure, tags, ingredients, vocabulary.

Search and filtering are client-side over the loaded collection (NFR-6), so
Stories 2.4 and 2.5 are covered in the frontend specs. What the backend owes
them is what this file checks: the fields exist, they are independently
clearable, the vocabulary converges on one casing, and the two namespaces never
leak into one another.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories import kitchencraft_repo as repo

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr("app.core.config.settings.data_dir", tmp_path)
    return tmp_path


def create(name: str = "Pumpkin dal", body: str = "Simmer.", **extra: object) -> dict:
    resp = client.post("/api/kitchencraft/recipes", json={"name": name, "body": body, **extra})
    assert resp.status_code == 200, resp.text
    return resp.json()


def put(recipe_id: str, **changes: object) -> dict:
    resp = client.put(f"/api/kitchencraft/recipes/{recipe_id}", json=changes)
    assert resp.status_code == 200, resp.text
    return resp.json()


# -- Story 2.1: meal type, time, servings, source ----------------------------


@pytest.mark.parametrize("meal_type", ["breakfast", "lunch", "dinner", "snack", "dessert", "other"])
def test_every_prd_meal_type_is_accepted(meal_type: str) -> None:
    assert create(meal_type=meal_type)["meal_type"] == meal_type


def test_a_meal_type_outside_the_prd_list_is_rejected() -> None:
    resp = client.post(
        "/api/kitchencraft/recipes",
        json={"name": "Dal", "body": "Simmer.", "meal_type": "brunch"},
    )
    assert resp.status_code == 422


def test_each_optional_field_is_settable_and_clearable_independently() -> None:
    recipe = create(meal_type="dinner", total_time_minutes=40, servings=4, source="Nan's book")
    assert (recipe["meal_type"], recipe["total_time_minutes"]) == ("dinner", 40)
    assert (recipe["servings"], recipe["source"]) == (4, "Nan's book")

    cleared = put(recipe["id"], total_time_minutes=None)
    assert cleared["total_time_minutes"] is None
    # Clearing one left the other three exactly as they were.
    assert cleared["meal_type"] == "dinner"
    assert cleared["servings"] == 4
    assert cleared["source"] == "Nan's book"

    emptied = put(recipe["id"], meal_type=None, servings=None, source=None)
    assert (emptied["meal_type"], emptied["servings"], emptied["source"]) == (None, None, None)


def test_an_absent_field_in_an_update_is_left_untouched() -> None:
    recipe = create(meal_type="dinner", servings=4)
    updated = put(recipe["id"], name="Renamed")
    assert updated["meal_type"] == "dinner"
    assert updated["servings"] == 4


@pytest.mark.parametrize("value", [0, -1, -40])
@pytest.mark.parametrize("field", ["total_time_minutes", "servings"])
def test_a_non_positive_time_or_servings_is_rejected_with_a_detail_string(
    field: str, value: int
) -> None:
    recipe = create()
    resp = client.put(f"/api/kitchencraft/recipes/{recipe['id']}", json={field: value})
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert isinstance(detail, str)
    assert field in detail


def test_a_non_numeric_time_is_rejected() -> None:
    resp = client.post(
        "/api/kitchencraft/recipes",
        json={"name": "Dal", "body": "Simmer.", "total_time_minutes": "4o"},
    )
    assert resp.status_code == 422


def test_a_blank_source_is_stored_as_absent_rather_than_an_empty_string() -> None:
    """The absence rule needs one representation of 'not set', not two."""
    assert create(source="   ")["source"] is None


# -- Story 2.2: free tags ----------------------------------------------------


def test_tags_are_stored_in_the_order_given() -> None:
    assert create(tags=["batch cooking", "cheap"])["tags"] == ["batch cooking", "cheap"]


def test_a_tag_typed_in_another_casing_folds_onto_the_existing_one() -> None:
    create(name="one", tags=["chicken"])
    second = create(name="two", tags=["Chicken"])
    assert second["tags"] == ["chicken"]

    vocabulary = client.get("/api/kitchencraft/vocabulary").json()
    assert vocabulary["tags"] == ["chicken"]


def test_the_two_casings_never_coexist_within_one_recipe() -> None:
    assert create(tags=["Chicken", "chicken", "CHICKEN"])["tags"] == ["Chicken"]


def test_a_genuinely_new_tag_is_accepted_as_typed() -> None:
    create(name="one", tags=["chicken"])
    assert create(name="two", tags=["Weeknight"])["tags"] == ["Weeknight"]


def test_tags_are_trimmed_and_blanks_dropped() -> None:
    assert create(tags=["  batch cooking  ", "   ", ""])["tags"] == ["batch cooking"]


def test_the_tag_vocabulary_is_every_tag_in_the_collection() -> None:
    create(name="one", tags=["cheap", "batch cooking"])
    create(name="two", tags=["cheap", "spicy"])
    tags = client.get("/api/kitchencraft/vocabulary").json()["tags"]
    assert sorted(tags) == ["batch cooking", "cheap", "spicy"]


def test_removing_a_tag_from_the_last_recipe_removes_it_from_the_vocabulary() -> None:
    recipe = create(tags=["cheap"])
    put(recipe["id"], tags=[])
    assert client.get("/api/kitchencraft/vocabulary").json()["tags"] == []


# -- Story 2.3: two-level ingredient tags ------------------------------------


def test_an_ingredient_is_an_amount_a_unit_and_a_name() -> None:
    recipe = create(
        ingredients=[
            {"amount": "200", "unit": "g", "text": "feta"},
            {"text": "garlic"},
        ]
    )
    assert recipe["ingredients"] == [
        {"amount": "200", "unit": "g", "text": "feta"},
        {"amount": None, "unit": None, "text": "garlic"},
    ]


def test_an_ingredient_with_no_name_is_rejected() -> None:
    resp = client.post(
        "/api/kitchencraft/recipes",
        json={"name": "Dal", "body": "Simmer.", "ingredients": [{"text": "  "}]},
    )
    assert resp.status_code == 422


@pytest.mark.parametrize("field", ["amount", "unit"])
def test_amount_and_unit_are_optional_and_never_block_a_save(field: str) -> None:
    # FR-3's rule reaches here too: no optional field may stand between a paste
    # and a saved recipe.
    recipe = create(ingredients=[{"text": "garlic"}])
    assert recipe["ingredients"][0][field] is None


def test_a_blank_amount_or_unit_is_stored_as_absent() -> None:
    recipe = create(ingredients=[{"amount": " ", "unit": "  ", "text": "garlic"}])
    assert recipe["ingredients"][0]["amount"] is None
    assert recipe["ingredients"][0]["unit"] is None


def test_an_amount_is_free_text_and_is_never_parsed() -> None:
    """`1/2`, `2-3` and `a few` are all things cooks write."""
    for amount in ("1/2", "2-3", "a few", "½"):
        recipe = create(name=f"r-{amount}", ingredients=[{"amount": amount, "text": "onion"}])
        assert recipe["ingredients"][0]["amount"] == amount


def test_an_ingredient_folds_onto_a_casing_the_collection_already_uses() -> None:
    create(name="one", ingredients=[{"text": "feta"}])
    second = create(name="two", ingredients=[{"text": "Feta"}])
    assert second["ingredients"][0]["text"] == "feta"


def test_the_same_ingredient_may_appear_twice_with_different_amounts() -> None:
    # 100g for the pastry, 20g for the pan.
    recipe = create(
        ingredients=[
            {"amount": "100", "unit": "g", "text": "butter"},
            {"amount": "20", "unit": "g", "text": "butter"},
        ]
    )
    assert len(recipe["ingredients"]) == 2


def test_an_exact_duplicate_ingredient_is_dropped() -> None:
    recipe = create(
        ingredients=[
            {"amount": "200", "unit": "g", "text": "feta"},
            {"amount": "200", "unit": "g", "text": "Feta"},
        ]
    )
    assert len(recipe["ingredients"]) == 1


# -- Vocabulary: units, the user's own ingredients, and the namespace wall ----


def test_the_unit_vocabulary_ships_seeded_for_a_brand_new_user() -> None:
    units = client.get("/api/kitchencraft/vocabulary").json()["units"]
    assert units == repo.read_seed_units()


def test_a_unit_outside_the_seed_is_accepted_and_joins_the_vocabulary() -> None:
    create(ingredients=[{"amount": "2", "unit": "fistfuls", "text": "lentils"}])
    units = client.get("/api/kitchencraft/vocabulary").json()["units"]
    assert "fistfuls" in units
    # The shipped list still leads, so the common case is offered first.
    assert units[: len(repo.read_seed_units())] == repo.read_seed_units()


def test_the_unit_vocabulary_has_no_case_insensitive_duplicates() -> None:
    create(name="one", ingredients=[{"unit": "Sprig", "text": "thyme"}])
    create(name="two", ingredients=[{"unit": "sprig", "text": "rosemary"}])
    units = client.get("/api/kitchencraft/vocabulary").json()["units"]
    assert len(units) == len({u.casefold() for u in units})


def test_the_ingredient_vocabulary_is_the_users_own_history() -> None:
    """v2 has no shared ingredient vocabulary; the field suggests what you typed."""
    assert client.get("/api/kitchencraft/vocabulary").json()["ingredients"] == []

    create(ingredients=[{"text": "smoked paprika"}])
    assert client.get("/api/kitchencraft/vocabulary").json()["ingredients"] == ["smoked paprika"]


def test_the_ingredient_vocabulary_has_no_case_insensitive_duplicates() -> None:
    create(name="one", ingredients=[{"text": "Feta"}])
    create(name="two", ingredients=[{"text": "feta"}])
    ingredients = client.get("/api/kitchencraft/vocabulary").json()["ingredients"]
    assert len(ingredients) == len({i.casefold() for i in ingredients})


def test_a_tag_never_appears_in_the_ingredient_namespace_or_vice_versa() -> None:
    """FR-8: a value typed into one input never lands in the other's namespace."""
    create(tags=["batch cooking"], ingredients=[{"text": "harissa"}])
    vocabulary = client.get("/api/kitchencraft/vocabulary").json()

    assert vocabulary["tags"] == ["batch cooking"]
    assert "batch cooking" not in vocabulary["ingredients"]
    assert "harissa" not in vocabulary["tags"]


def test_one_users_vocabulary_is_not_anothers(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.dependencies import get_current_user

    app.dependency_overrides[get_current_user] = lambda: "nell"
    create(tags=["batch cooking"], ingredients=[{"text": "harissa"}])

    app.dependency_overrides[get_current_user] = lambda: "bram"
    vocabulary = client.get("/api/kitchencraft/vocabulary").json()
    assert vocabulary["tags"] == []
    # Ingredients are the user's own history in v2, so nothing crosses over.
    assert vocabulary["ingredients"] == []
    # The unit seed is shared, though — it ships with the app, not the account.
    assert "tbsp" in vocabulary["units"]


# -- Story 2.6: favourites ---------------------------------------------------


def test_the_favourite_flag_persists() -> None:
    recipe = create()
    assert put(recipe["id"], favourite=True)["favourite"] is True
    assert client.get(f"/api/kitchencraft/recipes/{recipe['id']}").json()["favourite"] is True
    assert put(recipe["id"], favourite=False)["favourite"] is False


def test_favourites_sort_above_everything_newest_first_within_each_group() -> None:
    ids = [create(name=name)["id"] for name in ("a", "b", "c", "d")]
    put(ids[0], favourite=True)  # oldest, favourited
    put(ids[2], favourite=True)

    listed = client.get("/api/kitchencraft/recipes").json()
    assert [r["name"] for r in listed] == ["c", "a", "d", "b"]


def test_unfavouriting_returns_a_recipe_to_the_date_ordered_group() -> None:
    ids = [create(name=name)["id"] for name in ("a", "b", "c")]
    put(ids[0], favourite=True)
    assert [r["name"] for r in client.get("/api/kitchencraft/recipes").json()] == ["a", "c", "b"]

    put(ids[0], favourite=False)
    assert [r["name"] for r in client.get("/api/kitchencraft/recipes").json()] == ["c", "b", "a"]


# -- Provenance schema (Architecture Gap 3; Epic 4 writes it) ----------------


def test_a_user_created_recipe_carries_no_provenance_marks() -> None:
    assert create()["unconfirmed"] == []


def test_an_update_drops_the_mark_on_a_field_it_changes() -> None:
    recipe = create()
    stored = repo.read_doc("test_user")
    stored.recipes[0].meal_type = "lunch"
    stored.recipes[0].unconfirmed = ["meal_type", "servings"]
    repo.write_doc("test_user", stored)

    updated = put(recipe["id"], meal_type="dinner")
    assert updated["unconfirmed"] == ["servings"]


def test_a_mark_for_a_value_that_is_gone_is_dropped_too() -> None:
    recipe = create(tags=["cheap"])
    stored = repo.read_doc("test_user")
    stored.recipes[0].unconfirmed = ["tag:cheap"]
    repo.write_doc("test_user", stored)

    assert put(recipe["id"], tags=[])["unconfirmed"] == []


# -- Story 2.7: a star rating alongside favourites ---------------------------


def test_a_rating_persists_and_round_trips() -> None:
    recipe = create()
    assert put(recipe["id"], rating=4)["rating"] == 4
    assert client.get(f"/api/kitchencraft/recipes/{recipe['id']}").json()["rating"] == 4


def test_a_recipe_starts_unrated() -> None:
    assert create()["rating"] is None


def test_a_rating_can_arrive_with_the_capture() -> None:
    assert create(rating=5)["rating"] == 5


def test_an_explicit_null_clears_the_rating() -> None:
    recipe = create(rating=3)
    assert put(recipe["id"], rating=None)["rating"] is None


def test_an_update_that_does_not_mention_the_rating_leaves_it_alone() -> None:
    recipe = create(rating=3)
    assert put(recipe["id"], name="Renamed")["rating"] == 3


@pytest.mark.parametrize("bad", [0, 6, -1, 99])
def test_a_rating_outside_one_to_five_is_rejected_as_detail(bad: int) -> None:
    recipe = create()
    resp = client.put(f"/api/kitchencraft/recipes/{recipe['id']}", json={"rating": bad})
    assert resp.status_code == 422
    # A `{ detail }` string, not pydantic's error array — the same path
    # total_time_minutes takes (Story 2.1).
    assert isinstance(resp.json()["detail"], str)
    assert "rating" in resp.json()["detail"]


def test_a_fractional_rating_is_rejected() -> None:
    # Caught by the schema rather than the service, so this one is pydantic's
    # error array — the same split `total_time_minutes` already has.
    recipe = create()
    resp = client.put(f"/api/kitchencraft/recipes/{recipe['id']}", json={"rating": 2.5})
    assert resp.status_code == 422


def test_a_rejected_rating_leaves_the_stored_value_untouched() -> None:
    recipe = create(rating=3)
    client.put(f"/api/kitchencraft/recipes/{recipe['id']}", json={"rating": 9})
    assert client.get(f"/api/kitchencraft/recipes/{recipe['id']}").json()["rating"] == 3


def test_rating_a_recipe_leaves_its_favourite_flag_alone() -> None:
    recipe = create()
    put(recipe["id"], favourite=True)
    assert put(recipe["id"], rating=2)["favourite"] is True


def test_favouriting_a_recipe_leaves_its_rating_alone() -> None:
    recipe = create(rating=5)
    assert put(recipe["id"], favourite=True)["rating"] == 5
    assert put(recipe["id"], favourite=False)["rating"] == 5


def test_clearing_a_rating_does_not_clear_the_favourite() -> None:
    recipe = create(rating=4)
    put(recipe["id"], favourite=True)
    result = put(recipe["id"], rating=None)
    assert result["rating"] is None
    assert result["favourite"] is True


def test_rating_does_not_enter_the_collection_order() -> None:
    # AC 4: the order is favourites-first, date descending, and ratings must not
    # disturb it — asserted rather than left implied.
    ids = [create(name=name)["id"] for name in ("a", "b", "c")]
    before = [r["name"] for r in client.get("/api/kitchencraft/recipes").json()]

    put(ids[0], rating=5)
    put(ids[2], rating=1)

    assert [r["name"] for r in client.get("/api/kitchencraft/recipes").json()] == before


def test_a_rating_never_becomes_a_provenance_mark() -> None:
    # Rating is a judgement only the cook can make, so the enrichment pass has
    # no business writing it and no `rating` key may appear in `unconfirmed`.
    recipe = create(rating=3)
    assert recipe["unconfirmed"] == []
    assert put(recipe["id"], rating=5)["unconfirmed"] == []
