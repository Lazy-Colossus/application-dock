"""Story 3.1 — one shopping list per user, opened from anywhere.

Only the list's existence, hand-entry and persistence. Ticking (3.2), sending a
recipe's ingredients (3.3) and add-versus-overwrite (3.4) are not covered here
because they do not exist yet.
"""

from __future__ import annotations

import threading
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories import kitchencraft_repo as repo
from app.services import kitchencraft_service as service

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr("app.core.config.settings.data_dir", tmp_path)
    return tmp_path


def get_list() -> dict:
    resp = client.get("/api/kitchencraft/shopping-list")
    assert resp.status_code == 200, resp.text
    return resp.json()


def add(text: str) -> dict:
    resp = client.post("/api/kitchencraft/shopping-list/items", json={"text": text})
    assert resp.status_code == 200, resp.text
    return resp.json()


# -- The empty list ----------------------------------------------------------


def test_a_user_with_no_file_gets_an_empty_list_not_an_error() -> None:
    assert get_list() == {"schema_version": 1, "items": []}


def test_reading_the_empty_list_writes_no_file(isolate: Path) -> None:
    get_list()
    assert not (isolate / "kitchencraft" / "shopping").exists()


# -- Hand-entry --------------------------------------------------------------


def test_an_item_persists_and_round_trips() -> None:
    item = add("oat milk")
    assert item["text"] == "oat milk"
    assert get_list()["items"] == [item]


def test_an_item_arrives_unticked() -> None:
    assert add("oat milk")["ticked"] is False


def test_an_item_carries_a_stable_minted_id() -> None:
    item = add("oat milk")
    assert item["id"].startswith("s-")
    assert len(item["id"]) == len("s-") + 8


def test_ids_are_unique_across_items() -> None:
    ids = {add(f"item {i}")["id"] for i in range(10)}
    assert len(ids) == 10


def test_items_stay_in_the_order_they_were_added() -> None:
    for text in ("bread", "milk", "apples", "coffee"):
        add(text)
    # Never sorted: a list that reorders under a thumb mid-shop is worse than
    # useless.
    assert [i["text"] for i in get_list()["items"]] == [
        "bread",
        "milk",
        "apples",
        "coffee",
    ]


def test_surrounding_whitespace_is_trimmed() -> None:
    assert add("  oat milk  ")["text"] == "oat milk"


def test_the_same_text_twice_is_two_items() -> None:
    # De-duplication belongs to Story 3.4's merge, not to hand-entry: a cook who
    # types "milk" twice may well want two.
    add("milk")
    add("milk")
    assert len(get_list()["items"]) == 2


def test_free_text_is_stored_verbatim_with_no_parsing() -> None:
    item = add("2 packs chicken thighs")
    assert item["text"] == "2 packs chicken thighs"
    # No quantity field, no unit, no link to a recipe or category.
    assert set(item) == {"id", "text", "ticked", "created_at"}


@pytest.mark.parametrize("bad", ["", "   ", "\n", "\t "])
def test_an_empty_item_is_rejected_with_a_detail_string(bad: str) -> None:
    resp = client.post("/api/kitchencraft/shopping-list/items", json={"text": bad})
    assert resp.status_code == 422
    assert isinstance(resp.json()["detail"], str)


def test_a_rejected_item_leaves_the_list_untouched() -> None:
    add("bread")
    client.post("/api/kitchencraft/shopping-list/items", json={"text": "  "})
    assert [i["text"] for i in get_list()["items"]] == ["bread"]


# -- One list per user, and no list management -------------------------------


def test_one_users_list_is_not_anothers(monkeypatch: pytest.MonkeyPatch) -> None:
    service.add_shopping_item("alice", "alice's bread")
    service.add_shopping_item("bob", "bob's milk")

    assert [i.text for i in service.get_shopping_list("alice").items] == ["alice's bread"]
    assert [i.text for i in service.get_shopping_list("bob").items] == ["bob's milk"]


def test_the_list_lives_beside_the_collection_not_inside_it(isolate: Path) -> None:
    # A separate document under its own lock, so ticking an item never rewrites
    # every recipe.
    service.add_shopping_item("alice", "bread")
    assert (isolate / "kitchencraft" / "shopping" / "alice.json").exists()
    assert not (isolate / "kitchencraft" / "users" / "alice.json").exists()


def test_a_recipe_write_does_not_touch_the_shopping_list() -> None:
    service.add_shopping_item("alice", "bread")
    service.create_recipe("alice", name="Dal", body="Simmer.")
    assert [i.text for i in service.get_shopping_list("alice").items] == ["bread"]


@pytest.mark.parametrize("username", ["../escape", "a/b", "..", "", "  ", "a\\b"])
def test_a_crafted_username_cannot_escape_the_shopping_directory(username: str) -> None:
    with pytest.raises(ValueError):
        service.get_shopping_list(username)


def test_there_is_no_route_for_creating_or_deleting_a_list() -> None:
    paths = {r.path for r in app.routes}  # type: ignore[attr-defined]
    shopping = {p for p in paths if "shopping" in p}
    # The whole shopping surface. Items are addressable; the list is not — there
    # is no `{list_id}` anywhere, because there is only ever one (FR-14).
    assert shopping == {
        "/api/kitchencraft/shopping-list",
        "/api/kitchencraft/shopping-list/items",
        "/api/kitchencraft/shopping-list/items/{item_id}",
    }
    assert not any("list_id" in p for p in shopping)


# -- Concurrency -------------------------------------------------------------


def test_simultaneous_adds_all_survive() -> None:
    """Two writers must not overwrite each other's item (NFR-1)."""
    errors: list[BaseException] = []

    def add_one(n: int) -> None:
        try:
            service.add_shopping_item("alice", f"item {n}")
        except BaseException as exc:  # noqa: BLE001 — recorded and re-raised below
            errors.append(exc)

    threads = [threading.Thread(target=add_one, args=(n,)) for n in range(12)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors
    assert len(service.get_shopping_list("alice").items) == 12


def test_a_write_under_the_lock_reads_what_the_previous_one_wrote() -> None:
    with repo.shopping_transaction("alice") as shopping_list:
        assert shopping_list.items == []
    service.add_shopping_item("alice", "bread")
    with repo.shopping_transaction("alice") as shopping_list:
        assert [i.text for i in shopping_list.items] == ["bread"]


# -- Story 3.2: ticking, deleting, clearing ----------------------------------


def tick(item_id: str, ticked: bool = True) -> dict:
    resp = client.put(f"/api/kitchencraft/shopping-list/items/{item_id}", json={"ticked": ticked})
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_an_item_can_be_ticked_and_it_persists() -> None:
    item = add("bread")
    assert tick(item["id"])["ticked"] is True
    assert get_list()["items"][0]["ticked"] is True


def test_a_ticked_item_can_be_unticked() -> None:
    item = add("bread")
    tick(item["id"])
    assert tick(item["id"], ticked=False)["ticked"] is False


def test_ticking_does_not_move_the_item() -> None:
    # The whole point: a list that reorders under a thumb mid-aisle is worse
    # than no list.
    for text in ("bread", "milk", "apples"):
        add(text)
    middle = get_list()["items"][1]

    tick(middle["id"])

    assert [i["text"] for i in get_list()["items"]] == ["bread", "milk", "apples"]
    assert get_list()["items"][1]["ticked"] is True


def test_ticking_one_item_leaves_the_others_alone() -> None:
    ids = [add(t)["id"] for t in ("bread", "milk")]
    tick(ids[0])
    assert [i["ticked"] for i in get_list()["items"]] == [True, False]


def test_ticking_an_unknown_item_is_a_404() -> None:
    resp = client.put("/api/kitchencraft/shopping-list/items/s-nope", json={"ticked": True})
    assert resp.status_code == 404
    assert isinstance(resp.json()["detail"], str)


def test_an_item_is_deleted_individually() -> None:
    ids = [add(t)["id"] for t in ("bread", "milk", "apples")]

    assert client.delete(f"/api/kitchencraft/shopping-list/items/{ids[1]}").status_code == 204

    assert [i["text"] for i in get_list()["items"]] == ["bread", "apples"]


def test_a_ticked_item_can_be_deleted_too() -> None:
    item = add("bread")
    tick(item["id"])
    assert client.delete(f"/api/kitchencraft/shopping-list/items/{item['id']}").status_code == 204
    assert get_list()["items"] == []


def test_deleting_an_unknown_item_is_a_404_not_a_silent_success() -> None:
    resp = client.delete("/api/kitchencraft/shopping-list/items/s-nope")
    assert resp.status_code == 404


def test_clear_empties_the_whole_list_including_ticked_items() -> None:
    ids = [add(t)["id"] for t in ("bread", "milk", "apples")]
    tick(ids[0])

    assert client.delete("/api/kitchencraft/shopping-list/items").status_code == 204

    assert get_list()["items"] == []


def test_clearing_an_empty_list_is_a_no_op_not_an_error() -> None:
    # The confirmation the user answered was about intent, not about state.
    assert client.delete("/api/kitchencraft/shopping-list/items").status_code == 204
    assert get_list()["items"] == []


def test_clear_does_not_touch_another_users_list() -> None:
    service.add_shopping_item("alice", "alice's bread")
    service.add_shopping_item("bob", "bob's milk")

    service.clear_shopping_list("alice")

    assert service.get_shopping_list("alice").items == []
    assert [i.text for i in service.get_shopping_list("bob").items] == ["bob's milk"]


def test_clear_leaves_the_recipes_alone() -> None:
    service.create_recipe("alice", name="Dal", body="Simmer.")
    service.add_shopping_item("alice", "bread")

    service.clear_shopping_list("alice")

    assert len(service.list_recipes("alice")) == 1


def test_the_route_for_clearing_is_not_read_as_an_item_id() -> None:
    # `DELETE /items` must clear, never 404 as though "items" were an id.
    add("bread")
    assert client.delete("/api/kitchencraft/shopping-list/items").status_code == 204


def test_simultaneous_ticks_do_not_lose_each_other() -> None:
    ids = [service.add_shopping_item("alice", f"item {n}").id for n in range(8)]
    errors: list[BaseException] = []

    def tick_one(item_id: str) -> None:
        try:
            service.set_item_ticked("alice", item_id, True)
        except BaseException as exc:  # noqa: BLE001 — recorded and asserted below
            errors.append(exc)

    threads = [threading.Thread(target=tick_one, args=(i,)) for i in ids]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors
    assert all(i.ticked for i in service.get_shopping_list("alice").items)
