"""Epic 4 — offline enrichment: provenance, the report, the batch, and drift.

The script has no HTTP surface and is never called by a router. These tests
drive the service directly, plus the script's own entry point through
`scripts.enrich.main`, which is how it is actually run.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.repositories import kitchencraft_repo as repo
from app.schemas.kitchencraft import Ingredient
from app.services import kitchencraft_service as service
from scripts import enrich


@pytest.fixture(autouse=True)
def isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr("app.core.config.settings.data_dir", tmp_path)
    return tmp_path


def make(name: str = "Dal", body: str = "Simmer the lentils.", **extra: object):
    return service.create_recipe("nell", name=name, body=body, **extra)  # type: ignore[arg-type]


# -- Story 4.1: provenance ---------------------------------------------------


def test_a_user_created_recipe_is_entirely_user_set() -> None:
    # The absence of a mark is the record: everything here is the user's.
    assert make(meal_type="dinner").unconfirmed == []


def test_a_mark_survives_a_read_write_round_trip() -> None:
    recipe = make()
    service.apply_enrichment("nell", {recipe.id: {"source": "a magazine"}}, write=True)

    reread = service.get_recipe("nell", recipe.id)
    assert reread.unconfirmed == ["source"]
    assert reread.source == "a magazine"


def test_a_user_edit_marks_the_field_user_set_whatever_it_was() -> None:
    recipe = make()
    service.apply_enrichment("nell", {recipe.id: {"source": "guessed"}}, write=True)
    assert service.get_recipe("nell", recipe.id).unconfirmed == ["source"]

    service.update_recipe("nell", recipe.id, {"source": "the actual book"})

    # The mark is gone: the user's value landed on top of the guess.
    assert service.get_recipe("nell", recipe.id).unconfirmed == []


def test_a_mark_for_a_value_that_is_gone_is_dropped() -> None:
    recipe = make()
    service.apply_enrichment("nell", {recipe.id: {"tags": ["guessed"]}}, write=True)
    assert service.get_recipe("nell", recipe.id).unconfirmed == ["tag:guessed"]

    service.update_recipe("nell", recipe.id, {"tags": []})

    assert service.get_recipe("nell", recipe.id).unconfirmed == []


def test_recipes_predating_enrichment_default_to_user_set(isolate: Path) -> None:
    """The safe default, and the true one: the only writer so far was the user."""
    path = isolate / "kitchencraft" / "users" / "nell.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "schema_version": 2,
                "recipes": [
                    {
                        "id": "r-old",
                        "name": "Older than provenance",
                        "body": "Simmer.",
                        "created_at": "2026-01-01T00:00:00+00:00",
                        "updated_at": "2026-01-01T00:00:00+00:00",
                        "meal_type": "dinner",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    assert service.get_recipe("nell", "r-old").unconfirmed == []


# -- Story 4.2: a report that changes nothing --------------------------------


def test_the_report_names_what_is_missing() -> None:
    bare = make(name="Bare")
    report = service.enrichment_report("nell")

    entry = next(r for r in report["recipes"] if r["id"] == bare.id)
    assert set(entry["missing_fields"]) == {
        "meal_type",
        "total_time_minutes",
        "servings",
        "source",
    }
    assert entry["has_tags"] is False
    assert entry["has_ingredients"] is False


def test_the_report_carries_the_body_so_a_pass_can_read_it() -> None:
    make(name="Dal", body="Red lentils, turmeric, water.")
    report = service.enrichment_report("nell")
    assert report["recipes"][0]["body"] == "Red lentils, turmeric, water."


def test_the_report_carries_the_wording_already_in_use() -> None:
    # Story 4.4: a pass that cannot see this will invent a near-synonym for it.
    make(tags=["batch-cook"], ingredients=[Ingredient(text="red lentils", unit="g", amount="200")])
    report = service.enrichment_report("nell")

    assert report["vocabulary"]["tags"] == ["batch-cook"]
    assert report["vocabulary"]["ingredients"] == ["red lentils"]
    assert "g" in report["vocabulary"]["units"]


def test_a_fully_structured_recipe_is_left_out_of_the_report() -> None:
    make(
        name="Complete",
        meal_type="dinner",
        total_time_minutes=40,
        servings=4,
        source="a book",
        tags=["weeknight"],
        ingredients=[Ingredient(text="lentils")],
    )
    assert service.enrichment_report("nell")["needing_attention"] == 0


def test_the_report_writes_nothing(isolate: Path) -> None:
    make()
    before = (isolate / "kitchencraft" / "users" / "nell.json").read_text()
    service.enrichment_report("nell")
    assert (isolate / "kitchencraft" / "users" / "nell.json").read_text() == before


def test_a_dry_run_changes_nothing_but_reports_what_it_would() -> None:
    recipe = make()
    result = service.apply_enrichment("nell", {recipe.id: {"source": "guessed"}})

    assert result["write"] is False
    assert result["applied"] == [recipe.id]
    assert service.get_recipe("nell", recipe.id).source is None


def test_the_script_refuses_to_run_on_an_unreadable_document(isolate: Path) -> None:
    path = isolate / "kitchencraft" / "users" / "nell.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"schema_version": 99, "recipes": []}), encoding="utf-8")

    # Non-zero, and nothing touched: a half-understood document is not something
    # to write back (NFR-3).
    assert enrich.main(["report", "--user", "nell"]) == 2


def test_the_script_reports_to_a_file(isolate: Path, capsys: pytest.CaptureFixture) -> None:
    make()
    out = isolate / "report.json"
    assert enrich.main(["report", "--user", "nell", "--out", str(out)]) == 0

    report = json.loads(out.read_text())
    assert report["username"] == "nell"
    assert "need attention" in capsys.readouterr().out


# -- Story 4.3: applying a batch ---------------------------------------------


def test_a_batch_fills_gaps_and_marks_them() -> None:
    recipe = make()
    service.apply_enrichment(
        "nell",
        {recipe.id: {"meal_type": "dinner", "servings": 4, "tags": ["weeknight"]}},
        write=True,
    )

    stored = service.get_recipe("nell", recipe.id)
    assert (stored.meal_type, stored.servings, stored.tags) == ("dinner", 4, ["weeknight"])
    assert stored.unconfirmed == ["meal_type", "servings", "tag:weeknight"]


def test_every_body_is_byte_identical_afterwards() -> None:
    body = "Red lentils, turmeric, water.\n\n- pop the cumin\n\nPour it over at the table."
    recipe = make(body=body)
    service.apply_enrichment(
        "nell", {recipe.id: {"meal_type": "dinner", "tags": ["x"]}}, write=True
    )
    assert service.get_recipe("nell", recipe.id).body == body


def test_a_batch_lands_after_the_user_has_renamed_the_recipe() -> None:
    recipe = make(name="Original")
    service.update_recipe("nell", recipe.id, {"name": "Renamed since"})

    service.apply_enrichment("nell", {recipe.id: {"source": "a book"}}, write=True)

    stored = service.get_recipe("nell", recipe.id)
    assert stored.name == "Renamed since"
    assert stored.source == "a book"


def test_an_unknown_id_is_reported_and_the_rest_still_applies() -> None:
    recipe = make()
    result = service.apply_enrichment(
        "nell",
        {"r-nope": {"source": "nowhere"}, recipe.id: {"source": "a book"}},
        write=True,
    )

    assert result["unknown"] == ["r-nope"]
    assert result["applied"] == [recipe.id]
    assert service.get_recipe("nell", recipe.id).source == "a book"


def test_an_identical_batch_run_twice_is_a_no_op() -> None:
    recipe = make()
    batch = {recipe.id: {"meal_type": "dinner", "tags": ["weeknight"]}}

    service.apply_enrichment("nell", batch, write=True)
    first = service.get_recipe("nell", recipe.id)

    second_result = service.apply_enrichment("nell", batch, write=True)
    second = service.get_recipe("nell", recipe.id)

    assert second_result["applied"] == []
    assert second_result["unchanged"] == [recipe.id]
    # No duplicated tags, no churned timestamp.
    assert second.tags == first.tags == ["weeknight"]
    assert second.updated_at == first.updated_at


def test_a_user_set_field_is_left_alone_and_the_skip_is_reported() -> None:
    recipe = make(meal_type="lunch")
    result = service.apply_enrichment("nell", {recipe.id: {"meal_type": "dinner"}}, write=True)

    assert result["skipped"] == {recipe.id: ["meal_type"]}
    assert service.get_recipe("nell", recipe.id).meal_type == "lunch"


def test_a_machine_set_field_may_be_revised_by_a_later_pass() -> None:
    # A guess is not a decision: the next pass may improve on it.
    recipe = make()
    service.apply_enrichment("nell", {recipe.id: {"servings": 2}}, write=True)
    service.apply_enrichment("nell", {recipe.id: {"servings": 6}}, write=True)

    assert service.get_recipe("nell", recipe.id).servings == 6


def test_a_hand_written_ingredient_list_is_never_added_to() -> None:
    # Adding to a list the user wrote is editing their work, not filling a gap.
    recipe = make(ingredients=[Ingredient(text="red lentils")])
    result = service.apply_enrichment(
        "nell", {recipe.id: {"ingredients": [{"text": "cumin"}]}}, write=True
    )

    assert result["skipped"] == {recipe.id: ["ingredients"]}
    assert [i.text for i in service.get_recipe("nell", recipe.id).ingredients] == ["red lentils"]


def test_ingredients_are_written_where_there_are_none() -> None:
    recipe = make()
    service.apply_enrichment(
        "nell",
        {recipe.id: {"ingredients": [{"amount": "200", "unit": "g", "text": "red lentils"}]}},
        write=True,
    )

    stored = service.get_recipe("nell", recipe.id)
    assert [(i.amount, i.unit, i.text) for i in stored.ingredients] == [("200", "g", "red lentils")]
    assert stored.unconfirmed == ["ingredient:red lentils"]


def test_an_invalid_number_is_rejected_and_nothing_is_written() -> None:
    recipe = make()
    with pytest.raises(ValueError):
        service.apply_enrichment("nell", {recipe.id: {"servings": 0}}, write=True)

    # The transaction did not complete, so no partial mutation survives.
    assert service.get_recipe("nell", recipe.id).servings is None


def test_one_users_batch_cannot_reach_another() -> None:
    mine = make(name="Mine")
    service.create_recipe("bram", name="Theirs", body="b")

    result = service.apply_enrichment("bram", {mine.id: {"source": "x"}}, write=True)

    assert result["unknown"] == [mine.id]


def test_the_rating_is_never_written_by_enrichment() -> None:
    # A judgement only the cook can make (Story 2.7).
    recipe = make()
    service.apply_enrichment("nell", {recipe.id: {"rating": 5}}, write=True)
    assert service.get_recipe("nell", recipe.id).rating is None


# -- Story 4.4: keeping the wording from drifting ----------------------------


def test_a_pass_reuses_the_casing_already_in_the_collection() -> None:
    first = make(name="One", tags=["Batch-Cook"])
    second = make(name="Two")

    service.apply_enrichment("nell", {second.id: {"tags": ["batch-cook"]}}, write=True)

    # One tag in the collection, not two that differ only in casing.
    assert service.get_vocabulary("nell").tags == ["Batch-Cook"]
    # Re-read: the first recipe's own tag is untouched by the second's pass.
    assert service.get_recipe("nell", first.id).tags == ["Batch-Cook"]


def test_an_ingredient_folds_onto_the_casing_the_collection_uses() -> None:
    make(name="One", ingredients=[Ingredient(text="red lentils")])
    second = make(name="Two")

    service.apply_enrichment(
        "nell", {second.id: {"ingredients": [{"text": "Red Lentils"}]}}, write=True
    )

    assert service.get_vocabulary("nell").ingredients == ["red lentils"]


def test_a_tag_already_on_the_recipe_is_not_duplicated_or_marked() -> None:
    recipe = make(tags=["weeknight"])
    service.apply_enrichment("nell", {recipe.id: {"tags": ["Weeknight"]}}, write=True)

    stored = service.get_recipe("nell", recipe.id)
    assert stored.tags == ["weeknight"]
    # The user's tag stays the user's: no mark is invented for it.
    assert stored.unconfirmed == []


def test_new_wording_is_reported_so_drift_is_visible(
    isolate: Path, capsys: pytest.CaptureFixture
) -> None:
    recipe = make(name="One", tags=["weeknight"])
    other = make(name="Two")
    batch = isolate / "batch.json"
    batch.write_text(json.dumps({other.id: {"tags": ["harissa-heavy"]}}), encoding="utf-8")

    enrich.main(["apply", "--user", "nell", "--batch", str(batch), "--write"])

    out = capsys.readouterr().out
    assert "New tags introduced by this run" in out
    assert "+ harissa-heavy" in out
    # The one that was already there is not reported as new.
    assert "+ weeknight" not in out
    assert service.get_recipe("nell", recipe.id).tags == ["weeknight"]


def test_the_script_exits_non_zero_when_an_id_was_unknown(isolate: Path) -> None:
    make()
    batch = isolate / "batch.json"
    batch.write_text(json.dumps({"r-nope": {"source": "x"}}), encoding="utf-8")

    assert enrich.main(["apply", "--user", "nell", "--batch", str(batch)]) == 1


def test_the_script_writes_nothing_without_the_flag(isolate: Path) -> None:
    recipe = make()
    batch = isolate / "batch.json"
    batch.write_text(json.dumps({recipe.id: {"source": "guessed"}}), encoding="utf-8")

    assert enrich.main(["apply", "--user", "nell", "--batch", str(batch)]) == 0
    assert service.get_recipe("nell", recipe.id).source is None


def test_the_script_writes_with_the_flag(isolate: Path) -> None:
    recipe = make()
    batch = isolate / "batch.json"
    batch.write_text(json.dumps({recipe.id: {"source": "guessed"}}), encoding="utf-8")

    assert enrich.main(["apply", "--user", "nell", "--batch", str(batch), "--write"]) == 0
    assert service.get_recipe("nell", recipe.id).source == "guessed"


def test_the_script_rejects_a_batch_that_is_not_an_object(isolate: Path) -> None:
    make()
    batch = isolate / "batch.json"
    batch.write_text(json.dumps(["not", "a", "map"]), encoding="utf-8")

    assert enrich.main(["apply", "--user", "nell", "--batch", str(batch)]) == 2


def test_enrichment_goes_through_the_repository_layer(monkeypatch: pytest.MonkeyPatch) -> None:
    """It must not read or rewrite JSON itself (FR-19, NFR-1).

    The lock and the atomic write both live in the repository, so a script that
    bypassed it would have neither.
    """
    recipe = make()
    seen: list[str] = []
    real = repo.doc_transaction

    def spy(username: str):
        seen.append(username)
        return real(username)

    monkeypatch.setattr(repo, "doc_transaction", spy)
    service.apply_enrichment("nell", {recipe.id: {"source": "a book"}}, write=True)

    assert seen == ["nell"]
