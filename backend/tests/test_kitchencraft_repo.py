"""Story 1.2 — the shared store: empty reads, atomic writes, the legacy merge.

These tests are deliberately at the repository seam rather than through the API:
the guarantees being checked are about the filesystem, and the router cannot
observe them.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.repositories import kitchencraft_repo as repo
from app.schemas.kitchencraft import Ingredient, KitchencraftDoc, Recipe
from app.services import kitchencraft_service as service


@pytest.fixture(autouse=True)
def isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr("app.core.config.settings.data_dir", tmp_path)
    return tmp_path


def _recipe(**over: object) -> Recipe:
    base = {
        "id": "r-00000001",
        "name": "Pumpkin dal",
        "body": "Simmer.",
        "created_at": "2026-09-10T18:40:00+00:00",
        "updated_at": "2026-09-10T18:40:00+00:00",
    }
    base.update(over)
    return Recipe.model_validate(base)


def test_read_doc_for_a_user_with_no_file_is_an_empty_document() -> None:
    doc = repo.read_doc()
    assert doc.schema_version == 3
    assert doc.recipes == []


def test_write_then_read_round_trips() -> None:
    repo.write_doc(KitchencraftDoc(recipes=[_recipe()]))
    assert [r.name for r in repo.read_doc().recipes] == ["Pumpkin dal"]


def test_the_collection_is_one_shared_file(isolate: Path) -> None:
    repo.write_doc(KitchencraftDoc(recipes=[_recipe()]))
    assert sorted(p.name for p in (isolate / "kitchencraft").iterdir()) == ["recipes.json"]


def test_write_leaves_no_temp_file_behind(isolate: Path) -> None:
    repo.write_doc(KitchencraftDoc(recipes=[_recipe()]))
    files = list((isolate / "kitchencraft").iterdir())
    assert [f.name for f in files] == ["recipes.json"]


# -- Merging the pre-sharing per-user files ----------------------------------


def _legacy(isolate: Path, owner: str, recipes: list[dict[str, object]]) -> Path:
    path = isolate / "kitchencraft" / "users" / f"{owner}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"schema_version": 2, "recipes": recipes}), encoding="utf-8")
    return path


def _raw(id: str, name: str, **over: object) -> dict[str, object]:
    return _recipe(id=id, name=name, **over).model_dump(mode="json")


def test_every_users_recipes_merge_into_the_shared_collection(isolate: Path) -> None:
    _legacy(isolate, "nell", [_raw("r-1", "Dal")])
    _legacy(isolate, "bram", [_raw("r-2", "Traybake"), _raw("r-3", "Soup")])

    # Filename order: bram before nell.
    assert [r.name for r in repo.read_doc().recipes] == ["Traybake", "Soup", "Dal"]


def test_the_merge_migrates_each_legacy_file_on_the_way_in(isolate: Path) -> None:
    _legacy(isolate, "nell", [_raw("r-1", "Dal", meal_type="dinner")])
    raw = json.loads((isolate / "kitchencraft" / "users" / "nell.json").read_text())
    raw["recipes"][0]["meal_type"] = "lunch"
    (isolate / "kitchencraft" / "users" / "nell.json").write_text(json.dumps(raw))

    assert repo.read_doc().recipes[0].meal_type == "dinner"


def test_a_clashing_id_is_rekeyed_rather_than_a_recipe_dropped(isolate: Path) -> None:
    _legacy(isolate, "nell", [_raw("r-1", "Nell's dal")])
    _legacy(isolate, "bram", [_raw("r-1", "Bram's dal")])

    recipes = repo.read_doc().recipes
    assert [(r.id, r.name) for r in recipes] == [("r-1", "Bram's dal"), ("r-1-nell", "Nell's dal")]


def test_reading_writes_nothing_and_the_first_write_persists_the_merge(isolate: Path) -> None:
    legacy = _legacy(isolate, "nell", [_raw("r-1", "Dal")])
    before = legacy.read_text()

    repo.read_doc()
    assert not (isolate / "kitchencraft" / "recipes.json").exists()

    with repo.doc_transaction() as doc:
        doc.recipes.append(_recipe(id="r-2", name="Traybake"))

    shared = json.loads((isolate / "kitchencraft" / "recipes.json").read_text())
    assert [r["name"] for r in shared["recipes"]] == ["Dal", "Traybake"]
    # Kept, untouched, as the backup.
    assert legacy.read_text() == before


def test_once_the_shared_file_exists_the_legacy_files_are_ignored(isolate: Path) -> None:
    repo.write_doc(KitchencraftDoc(recipes=[_recipe(name="Shared")]))
    _legacy(isolate, "nell", [_raw("r-9", "Stale")])
    assert [r.name for r in repo.read_doc().recipes] == ["Shared"]


def test_a_future_schema_version_is_rejected_rather_than_guessed_at(isolate: Path) -> None:
    path = isolate / "kitchencraft" / "recipes.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps({"schema_version": 99, "recipes": []}), encoding="utf-8")

    with pytest.raises(ValueError, match="schema_version"):
        repo.read_doc()


def test_migrate_is_a_pass_through_at_v1() -> None:
    raw = {"schema_version": 1, "recipes": []}
    assert repo.migrate(raw) == raw


def test_a_document_with_no_schema_version_reads_as_v1() -> None:
    assert repo.migrate({"recipes": []}) == {"recipes": []}


def test_doc_transaction_writes_on_a_clean_exit() -> None:
    with repo.doc_transaction() as doc:
        doc.recipes.append(_recipe())
    assert len(repo.read_doc().recipes) == 1


def test_doc_transaction_writes_nothing_when_the_block_raises() -> None:
    repo.write_doc(KitchencraftDoc(recipes=[_recipe()]))

    with pytest.raises(ValueError):
        with repo.doc_transaction() as doc:
            doc.recipes.append(_recipe(id="r-2", name="Lost"))
            raise ValueError("rejected")

    assert [r.name for r in repo.read_doc().recipes] == ["Pumpkin dal"]


# -- The shipped seed ---------------------------------------------------------


def test_the_shipped_seed_loads_and_is_not_stored_under_data_dir(isolate: Path) -> None:
    units = repo.read_seed_units()
    assert len(units) > 10
    assert not (isolate / "kitchencraft" / "units.json").exists()


def test_the_seed_has_no_case_insensitive_duplicates() -> None:
    units = repo.read_seed_units()
    assert len(units) == len({u.casefold() for u in units})


def test_the_seed_ships_the_units_a_home_cook_reaches_for() -> None:
    units = repo.read_seed_units()
    assert {"g", "kg", "ml", "tbsp", "tsp", "clove", "pack"} <= set(units)


def test_the_seed_is_not_a_closed_set() -> None:
    """A unit that is not shipped is still accepted and joins the user's own."""
    service.create_recipe(
        name="Dal",
        body="Simmer.",
        ingredients=[Ingredient(amount="2", unit="fistfuls", text="lentils")],
    )
    assert "fistfuls" in service.get_vocabulary().units


# -- Migrating v1 ingredients to v2 ------------------------------------------


def test_a_v1_document_migrates_its_ingredients_on_read(isolate: Path) -> None:
    """Two-level tags become amount + unit + free text, keeping what was shown.

    A v1 tag displayed as its specific where there was one and its bare category
    where there was not, so `text = specific or category` leaves every recipe
    reading exactly as it did before the upgrade.
    """
    path = isolate / "kitchencraft" / "recipes.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "categories": ["harissa"],
                "recipes": [
                    {
                        "id": "r-1",
                        "name": "Greek-ish salad",
                        "body": "Chop.",
                        "created_at": "2026-09-01T00:00:00+00:00",
                        "updated_at": "2026-09-01T00:00:00+00:00",
                        "ingredients": [
                            {"category": "cheese", "specific": "feta"},
                            {"category": "cucumber", "specific": None},
                        ],
                        "unconfirmed": ["ingredient:cheese", "meal_type"],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    doc = repo.read_doc()

    assert doc.schema_version == 3
    assert [(i.amount, i.unit, i.text) for i in doc.recipes[0].ingredients] == [
        (None, None, "feta"),
        (None, None, "cucumber"),
    ]
    # The provenance key named a category that no longer exists; the others stay.
    assert doc.recipes[0].unconfirmed == ["meal_type"]


def test_migration_drops_the_users_coined_categories(isolate: Path) -> None:
    path = isolate / "kitchencraft" / "recipes.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"schema_version": 1, "categories": ["harissa"], "recipes": []}),
        encoding="utf-8",
    )
    # There is no shared vocabulary in v2 for them to live in.
    assert not hasattr(repo.read_doc(), "categories")


def _v2_recipe(**over: object) -> dict[str, object]:
    recipe: dict[str, object] = {
        "id": "r-1",
        "name": "Dal",
        "body": "Simmer.",
        "created_at": "2026-09-01T00:00:00+00:00",
        "updated_at": "2026-09-01T00:00:00+00:00",
        "ingredients": [{"amount": "2", "unit": "tsp", "text": "cumin"}],
    }
    recipe.update(over)
    return recipe


def test_a_v3_document_is_left_alone() -> None:
    raw = {"schema_version": 3, "recipes": [_v2_recipe(meal_type="dinner")]}
    assert repo.migrate(json.loads(json.dumps(raw))) == raw


def test_v2_to_v3_touches_nothing_but_the_version_when_no_meal_type_is_retired() -> None:
    raw = {"schema_version": 2, "recipes": [_v2_recipe(meal_type="dessert")]}
    migrated = repo.migrate(json.loads(json.dumps(raw)))
    assert migrated == {**raw, "schema_version": 3}


def test_v2_to_v3_files_lunch_under_dinner_and_keeps_its_mark() -> None:
    raw = {
        "schema_version": 2,
        "recipes": [_v2_recipe(meal_type="lunch", unconfirmed=["meal_type", "servings"])],
    }
    recipe = repo.migrate(raw)["recipes"][0]
    assert recipe["meal_type"] == "dinner"
    # Whoever set lunch still stands behind dinner.
    assert recipe["unconfirmed"] == ["meal_type", "servings"]


@pytest.mark.parametrize("retired", ["snack", "other"])
def test_v2_to_v3_clears_snack_and_other_with_their_mark(retired: str) -> None:
    raw = {
        "schema_version": 2,
        "recipes": [_v2_recipe(meal_type=retired, unconfirmed=["meal_type", "servings"])],
    }
    recipe = repo.migrate(raw)["recipes"][0]
    assert recipe["meal_type"] is None
    assert recipe["unconfirmed"] == ["servings"]


def test_a_v2_file_with_a_retired_meal_type_reads_back_as_v3(isolate: Path) -> None:
    path = isolate / "kitchencraft" / "recipes.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "schema_version": 2,
                "recipes": [
                    _v2_recipe(id="r-1", meal_type="lunch"),
                    _v2_recipe(id="r-2", meal_type="snack"),
                    _v2_recipe(id="r-3", meal_type="breakfast"),
                ],
            }
        ),
        encoding="utf-8",
    )
    doc = repo.read_doc()
    assert doc.schema_version == 3
    assert [r.meal_type for r in doc.recipes] == ["dinner", None, "breakfast"]


def test_a_v1_file_walks_the_whole_chain() -> None:
    raw = {
        "schema_version": 1,
        "recipes": [
            _v2_recipe(
                meal_type="lunch",
                ingredients=[{"category": "cheese", "specific": "feta"}],
            )
        ],
    }
    migrated = repo.migrate(raw)
    assert migrated["schema_version"] == 3
    assert migrated["recipes"][0]["meal_type"] == "dinner"
    assert migrated["recipes"][0]["ingredients"] == [{"amount": None, "unit": None, "text": "feta"}]


def test_an_unknown_future_version_is_refused_rather_than_coerced() -> None:
    with pytest.raises(ValueError):
        repo.migrate({"schema_version": 99, "recipes": []})
