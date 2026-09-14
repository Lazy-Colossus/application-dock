"""Story 1.2 — the per-user store: empty reads, atomic writes, path safety.

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
    doc = repo.read_doc("nell")
    assert doc.schema_version == 2
    assert doc.recipes == []


def test_write_then_read_round_trips() -> None:
    repo.write_doc("nell", KitchencraftDoc(recipes=[_recipe()]))
    assert [r.name for r in repo.read_doc("nell").recipes] == ["Pumpkin dal"]


def test_each_user_gets_their_own_file(isolate: Path) -> None:
    repo.write_doc("nell", KitchencraftDoc(recipes=[_recipe()]))
    repo.write_doc("bram", KitchencraftDoc(recipes=[_recipe(id="r-2", name="Traybake")]))

    assert [r.name for r in repo.read_doc("nell").recipes] == ["Pumpkin dal"]
    assert [r.name for r in repo.read_doc("bram").recipes] == ["Traybake"]
    users = sorted(p.name for p in (isolate / "kitchencraft" / "users").iterdir())
    assert users == ["bram.json", "nell.json"]


def test_write_leaves_no_temp_file_behind(isolate: Path) -> None:
    repo.write_doc("nell", KitchencraftDoc(recipes=[_recipe()]))
    files = list((isolate / "kitchencraft" / "users").iterdir())
    assert [f.name for f in files] == ["nell.json"]


@pytest.mark.parametrize("username", ["../escape", "nell/../bram", "", "   ", ".", ".."])
def test_a_crafted_username_cannot_escape_the_users_directory(username: str) -> None:
    with pytest.raises(ValueError):
        repo.read_doc(username)


def test_a_future_schema_version_is_rejected_rather_than_guessed_at(isolate: Path) -> None:
    path = isolate / "kitchencraft" / "users" / "nell.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps({"schema_version": 99, "recipes": []}), encoding="utf-8")

    with pytest.raises(ValueError, match="schema_version"):
        repo.read_doc("nell")


def test_migrate_is_a_pass_through_at_v1() -> None:
    raw = {"schema_version": 1, "recipes": []}
    assert repo.migrate(raw) == raw


def test_a_document_with_no_schema_version_reads_as_v1() -> None:
    assert repo.migrate({"recipes": []}) == {"recipes": []}


def test_doc_transaction_writes_on_a_clean_exit() -> None:
    with repo.doc_transaction("nell") as doc:
        doc.recipes.append(_recipe())
    assert len(repo.read_doc("nell").recipes) == 1


def test_doc_transaction_writes_nothing_when_the_block_raises() -> None:
    repo.write_doc("nell", KitchencraftDoc(recipes=[_recipe()]))

    with pytest.raises(ValueError):
        with repo.doc_transaction("nell") as doc:
            doc.recipes.append(_recipe(id="r-2", name="Lost"))
            raise ValueError("rejected")

    assert [r.name for r in repo.read_doc("nell").recipes] == ["Pumpkin dal"]


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
        "nell",
        name="Dal",
        body="Simmer.",
        ingredients=[Ingredient(amount="2", unit="fistfuls", text="lentils")],
    )
    assert "fistfuls" in service.get_vocabulary("nell").units


# -- Migrating v1 ingredients to v2 ------------------------------------------


def test_a_v1_document_migrates_its_ingredients_on_read(isolate: Path) -> None:
    """Two-level tags become amount + unit + free text, keeping what was shown.

    A v1 tag displayed as its specific where there was one and its bare category
    where there was not, so `text = specific or category` leaves every recipe
    reading exactly as it did before the upgrade.
    """
    path = isolate / "kitchencraft" / "users" / "nell.json"
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

    doc = repo.read_doc("nell")

    assert doc.schema_version == 2
    assert [(i.amount, i.unit, i.text) for i in doc.recipes[0].ingredients] == [
        (None, None, "feta"),
        (None, None, "cucumber"),
    ]
    # The provenance key named a category that no longer exists; the others stay.
    assert doc.recipes[0].unconfirmed == ["meal_type"]


def test_migration_drops_the_users_coined_categories(isolate: Path) -> None:
    path = isolate / "kitchencraft" / "users" / "nell.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"schema_version": 1, "categories": ["harissa"], "recipes": []}),
        encoding="utf-8",
    )
    # There is no shared vocabulary in v2 for them to live in.
    assert not hasattr(repo.read_doc("nell"), "categories")


def test_a_v2_document_is_left_alone() -> None:
    raw = {
        "schema_version": 2,
        "recipes": [
            {
                "id": "r-1",
                "name": "Dal",
                "body": "Simmer.",
                "created_at": "2026-09-01T00:00:00+00:00",
                "updated_at": "2026-09-01T00:00:00+00:00",
                "ingredients": [{"amount": "2", "unit": "tsp", "text": "cumin"}],
            }
        ],
    }
    assert repo.migrate(dict(raw)) == raw


def test_an_unknown_future_version_is_refused_rather_than_coerced() -> None:
    with pytest.raises(ValueError):
        repo.migrate({"schema_version": 99, "recipes": []})
