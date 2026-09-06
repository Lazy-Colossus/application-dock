"""Story 1.2 — the curated question set, its schema, and its loader."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.schemas.qotd import Question, Scale
from app.services import qotd_service as service


def test_bundled_set_loads_and_validates() -> None:
    questions = service.load_questions()
    assert len(questions) >= 1
    ids = [q.id for q in questions]
    assert len(set(ids)) == len(ids)  # unique ids
    for q in questions:
        assert q.text
        assert q.type in {"text", "scale"}
        if q.type == "scale":
            assert q.scale is not None
            assert q.scale.min < q.scale.max
        else:
            assert q.scale is None


def test_bundled_set_covers_both_types() -> None:
    types = {q.type for q in service.load_questions()}
    assert types == {"text", "scale"}


def test_get_question_resolves_a_known_id() -> None:
    first = service.load_questions()[0]
    assert service.get_question(first.id) == first


def test_get_question_raises_on_unknown_id() -> None:
    with pytest.raises(KeyError):
        service.get_question("q-does-not-exist")


# --- loader guards (point the loader at a bad fixture) ---


def _write(path: Path, payload: object) -> Path:
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def test_empty_set_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        service._read_and_validate(_write(tmp_path / "q.json", []))


def test_non_list_set_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        service._read_and_validate(_write(tmp_path / "q.json", {"id": "x"}))


def test_duplicate_ids_are_rejected(tmp_path: Path) -> None:
    payload = [
        {"id": "dup", "text": "a", "type": "text"},
        {"id": "dup", "text": "b", "type": "text"},
    ]
    with pytest.raises(ValueError):
        service._read_and_validate(_write(tmp_path / "q.json", payload))


def test_scale_question_missing_bounds_is_rejected(tmp_path: Path) -> None:
    payload = [{"id": "s", "text": "how much?", "type": "scale"}]
    with pytest.raises(ValueError):
        service._read_and_validate(_write(tmp_path / "q.json", payload))


def test_text_question_carrying_scale_is_rejected(tmp_path: Path) -> None:
    payload = [{"id": "t", "text": "why?", "type": "text", "scale": {"min": 1, "max": 5}}]
    with pytest.raises(ValueError):
        service._read_and_validate(_write(tmp_path / "q.json", payload))


# --- schema-level guards ---


def test_scale_rejects_min_not_below_max() -> None:
    with pytest.raises(ValueError):
        Scale(min=5, max=5)
    with pytest.raises(ValueError):
        Scale(min=6, max=5)


def test_scale_question_requires_a_scale() -> None:
    with pytest.raises(ValueError):
        Question(id="s", text="?", type="scale")


def test_text_question_forbids_a_scale() -> None:
    with pytest.raises(ValueError):
        Question(id="t", text="?", type="text", scale=Scale(min=1, max=5))
