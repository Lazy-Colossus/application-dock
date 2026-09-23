"""NFR-1 / NFR-3 — concurrent writes must not lose a recipe or tear a file.

The body is the irreplaceable asset in this app, so the interesting case is not
"does the write land" but "can a second writer's stale read overwrite the first
writer's paste". The per-file lock is what makes the answer no — and with
every user on the one shared collection, it is doing real work.
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
        [lambda i=i: service.create_recipe(name=f"recipe-{i}", body=f"body-{i}") for i in range(n)]
    )

    assert not errors
    recipes = service.list_recipes()
    assert {r.name for r in recipes} == {f"recipe-{i}" for i in range(n)}
    # Every body arrived with its own recipe — no interleaving swapped them.
    assert all(r.body == r.name.replace("recipe", "body") for r in recipes)


def test_simultaneous_edits_to_different_recipes_both_survive() -> None:
    first = service.create_recipe(name="first", body="one")
    second = service.create_recipe(name="second", body="two")

    errors = _run(
        [
            lambda: service.update_recipe(first.id, {"meal_type": "dinner"}),
            lambda: service.update_recipe(second.id, {"servings": 4}),
        ]
    )

    assert not errors
    by_id = {r.id: r for r in service.list_recipes()}
    assert by_id[first.id].meal_type == "dinner"
    assert by_id[second.id].servings == 4


def test_an_edit_racing_a_capture_loses_neither() -> None:
    existing = service.create_recipe(name="existing", body="keep me exactly")

    errors = _run(
        [
            lambda: service.update_recipe(existing.id, {"favourite": True}),
            lambda: service.create_recipe(name="new", body="pasted"),
        ]
    )

    assert not errors
    recipes = {r.name: r for r in service.list_recipes()}
    assert set(recipes) == {"existing", "new"}
    assert recipes["existing"].favourite is True
    assert recipes["existing"].body == "keep me exactly"


def test_a_held_shopping_list_does_not_block_a_recipe_save() -> None:
    """Different files stay concurrent — ticking an item never stalls a paste.

    Every cook shares one collection now, so two recipe saves do serialize; the
    list and the collection are still separate files under separate locks.
    """
    started = threading.Event()
    release = threading.Event()

    def hold_list() -> None:
        with repo.shopping_transaction():
            started.set()
            release.wait(timeout=5)

    holder = threading.Thread(target=hold_list)
    holder.start()
    assert started.wait(timeout=1)

    saver = threading.Thread(target=lambda: service.create_recipe(name="Traybake", body="Oven."))
    saver.start()
    saver.join(timeout=1)
    # Finished while the list's lock was still held.
    assert not saver.is_alive()
    assert [r.name for r in service.list_recipes()] == ["Traybake"]

    release.set()
    holder.join()


def test_a_rejected_edit_writes_nothing() -> None:
    recipe = service.create_recipe(name="keep", body="keep")

    with pytest.raises(ValueError):
        service.update_recipe(recipe.id, {"name": "renamed", "servings": 0})

    # The valid half of the rejected update did not sneak through either.
    stored = service.get_recipe(recipe.id)
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
                name=f"r{i}",
                body="b",
                ingredients=[Ingredient(text="Harissa" if i % 2 else "harissa")],
            )
            for i in range(6)
        ]
    )

    assert not errors
    used = {i.text for r in repo.read_doc().recipes for i in r.ingredients}
    assert len(used) == 1
