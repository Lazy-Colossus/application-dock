"""NFR-1 / NFR-3 — concurrent writes must not lose a recipe or tear a file.

The body is the irreplaceable asset in this app, so the interesting case is not
"does the write land" but "can a second writer's stale read overwrite the first
writer's paste". The per-file lock is what makes the answer no.
"""

from __future__ import annotations

import threading
from pathlib import Path

import pytest

from app.repositories import kitchencraft_repo as repo
from app.schemas.kitchencraft import Ingredient
from app.services import kitchencraft_service as service


@pytest.fixture(autouse=True)
def isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr("app.core.config.settings.data_dir", tmp_path)
    return tmp_path


def _run(fns: list) -> list[BaseException]:
    errors: list[BaseException] = []
    barrier = threading.Barrier(len(fns))

    def wrapped(fn):
        def inner() -> None:
            barrier.wait()
            try:
                fn()
            except BaseException as exc:  # pragma: no cover - surfaced by assert
                errors.append(exc)

        return inner

    threads = [threading.Thread(target=wrapped(fn)) for fn in fns]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return errors


def test_eight_simultaneous_captures_keep_every_recipe() -> None:
    n = 8
    errors = _run(
        [
            lambda i=i: service.create_recipe("nell", name=f"recipe-{i}", body=f"body-{i}")
            for i in range(n)
        ]
    )

    assert not errors
    recipes = service.list_recipes("nell")
    assert {r.name for r in recipes} == {f"recipe-{i}" for i in range(n)}
    # Every body arrived with its own recipe — no interleaving swapped them.
    assert all(r.body == r.name.replace("recipe", "body") for r in recipes)


def test_simultaneous_edits_to_different_recipes_both_survive() -> None:
    first = service.create_recipe("nell", name="first", body="one")
    second = service.create_recipe("nell", name="second", body="two")

    errors = _run(
        [
            lambda: service.update_recipe("nell", first.id, {"meal_type": "dinner"}),
            lambda: service.update_recipe("nell", second.id, {"servings": 4}),
        ]
    )

    assert not errors
    by_id = {r.id: r for r in service.list_recipes("nell")}
    assert by_id[first.id].meal_type == "dinner"
    assert by_id[second.id].servings == 4


def test_an_edit_racing_a_capture_loses_neither() -> None:
    existing = service.create_recipe("nell", name="existing", body="keep me exactly")

    errors = _run(
        [
            lambda: service.update_recipe("nell", existing.id, {"favourite": True}),
            lambda: service.create_recipe("nell", name="new", body="pasted"),
        ]
    )

    assert not errors
    recipes = {r.name: r for r in service.list_recipes("nell")}
    assert set(recipes) == {"existing", "new"}
    assert recipes["existing"].favourite is True
    assert recipes["existing"].body == "keep me exactly"


def test_two_users_are_not_serialized_against_each_other() -> None:
    """Different files must stay concurrent — one cook must not block another."""
    started = threading.Event()
    release = threading.Event()

    def hold_nell() -> None:
        with repo.doc_transaction("nell"):
            started.set()
            release.wait(timeout=1)

    holder = threading.Thread(target=hold_nell)
    holder.start()
    assert started.wait(timeout=1)

    service.create_recipe("bram", name="Traybake", body="Oven.")
    assert [r.name for r in service.list_recipes("bram")] == ["Traybake"]

    release.set()
    holder.join()


def test_a_rejected_edit_writes_nothing() -> None:
    recipe = service.create_recipe("nell", name="keep", body="keep")

    with pytest.raises(ValueError):
        service.update_recipe("nell", recipe.id, {"name": "renamed", "servings": 0})

    # The valid half of the rejected update did not sneak through either.
    stored = service.get_recipe("nell", recipe.id)
    assert stored.name == "keep"
    assert stored.servings is None


def test_concurrent_writes_of_one_ingredient_converge_on_one_casing() -> None:
    """Six recipes coining the same ingredient at once must not fork its casing.

    v2 has no shared vocabulary to coin into, but the casing rule still applies
    across the collection — whichever write lands first sets the casing every
    later one folds onto.
    """
    errors = _run(
        [
            lambda i=i: service.create_recipe(
                "nell",
                name=f"r{i}",
                body="b",
                ingredients=[Ingredient(text="Harissa" if i % 2 else "harissa")],
            )
            for i in range(6)
        ]
    )

    assert not errors
    used = {i.text for r in repo.read_doc("nell").recipes for i in r.ingredients}
    assert len(used) == 1
