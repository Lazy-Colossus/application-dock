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
from app.schemas.kitchencraft import KitchencraftDoc, Recipe


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
    assert doc.schema_version == 1
    assert doc.recipes == []
    assert doc.categories == []


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
    categories = repo.read_seed_categories()
    assert len(categories) > 50
    assert not (isolate / "kitchencraft" / "ingredient_categories.json").exists()


def test_the_seed_has_no_case_insensitive_duplicates() -> None:
    categories = repo.read_seed_categories()
    assert len(categories) == len({c.casefold() for c in categories})


def test_the_seed_ships_the_epic_3_staples() -> None:
    """Epic 3 starts salt and black pepper unchecked, so they have to exist."""
    categories = repo.read_seed_categories()
    assert "salt" in categories
    assert "black pepper" in categories


def test_the_seed_ships_the_categories_the_ux_flows_demonstrate() -> None:
    """`chi` must offer both; `cheese` carries the specific example."""
    categories = repo.read_seed_categories()
    assert {"chicken", "chickpeas", "cheese", "onion"} <= set(categories)
    # `harissa` is the spine's example of a category the user coins, so it is
    # deliberately absent from the seed.
    assert "harissa" not in categories
