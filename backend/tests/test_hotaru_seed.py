"""Tests for the offline Hotaru seed builder (Story 1.1)."""

import json
from pathlib import Path

import pytest

from scripts.build_hotaru_seed import build_seed, check_unique, drill_caps

SAMPLE = [
    {
        "hiragana": "ありがとう",
        "kanji": "",
        "romaji": "arigatou",
        "type": "expression",
        "english": "Thank you.",
        "lesson": "G",
        "edition": 3,
    },
    {
        "hiragana": "すみません",
        "kanji": "",
        "romaji": "sumimasen",
        "type": "expression",
        "english": "Excuse me.",
        "lesson": "G",
        "edition": 3,
    },
    {
        "hiragana": "だいがく",
        "kanji": "大学",
        "romaji": "daigaku",
        "type": "noun",
        "english": "university",
        "lesson": "1",
        "edition": 3,
    },
    {
        "hiragana": "せんせい",
        "kanji": "先生",
        "romaji": "sensei",
        "type": "noun",
        "english": "teacher",
        "lesson": "1",
        "edition": 3,
    },
]

_SEED_FILE = Path(__file__).resolve().parent.parent / "app" / "hotaru_seed" / "vocab_seed.json"


def _by_reading(seed: dict) -> dict[str, dict]:
    return {w["reading"]: w for w in seed["words"]}


def test_field_mapping_and_id_format() -> None:
    words = _by_reading(build_seed(SAMPLE))
    daigaku = words["だいがく"]
    # Deterministic sort by reading puts せんせい (0001) before だいがく (0002) in lesson 1.
    assert daigaku["id"] == "genki_3-1-0002"
    assert daigaku["source"] == "genki_3"
    assert daigaku["reading"] == "だいがく"
    assert daigaku["kanji"] == "大学"
    assert daigaku["romaji"] == "daigaku"
    assert daigaku["meaning"] == "university"
    assert daigaku["pos"] == "noun"
    assert daigaku["lesson"] == "1"
    assert daigaku["visibility"] == "shared"
    assert "edition" not in daigaku  # folded into source


def test_empty_kanji_becomes_none() -> None:
    words = _by_reading(build_seed(SAMPLE))
    assert words["ありがとう"]["kanji"] is None


def test_drill_caps_floor_and_k2r() -> None:
    # Reading + meaning floor: every word is at least r2m + m2r.
    assert drill_caps(None) == ["r2m", "m2r"]
    assert drill_caps("大学") == ["r2m", "m2r", "k2r"]
    for w in build_seed(SAMPLE)["words"]:
        assert len(w["drill_caps"]) >= 2
        assert ("k2r" in w["drill_caps"]) == (w["kanji"] is not None)


def test_source_derived_from_edition() -> None:
    assert all(w["source"] == "genki_3" for w in build_seed(SAMPLE)["words"])


def test_ids_unique_and_schema_version() -> None:
    seed = build_seed(SAMPLE)
    assert seed["schema_version"] == 1
    ids = [w["id"] for w in seed["words"]]
    assert len(ids) == len(set(ids))


def test_seq_is_per_lesson_group_and_zero_padded() -> None:
    ids = {w["id"] for w in build_seed(SAMPLE)["words"]}
    # Two G-lesson expressions and two lesson-1 nouns, each numbered from 0001.
    assert ids == {
        "genki_3-G-0001",
        "genki_3-G-0002",
        "genki_3-1-0001",
        "genki_3-1-0002",
    }


def test_deterministic_regardless_of_row_order() -> None:
    forward = build_seed(SAMPLE)
    reversed_ = build_seed(list(reversed(SAMPLE)))
    assert forward == reversed_


def test_check_unique_raises_on_duplicate() -> None:
    with pytest.raises(ValueError, match="Duplicate word id"):
        check_unique([{"id": "genki_3-1-0001"}, {"id": "genki_3-1-0001"}])


def test_committed_seed_file_is_valid() -> None:
    assert _SEED_FILE.exists(), "run `python backend/scripts/build_hotaru_seed.py`"
    seed = json.loads(_SEED_FILE.read_text(encoding="utf-8"))
    assert isinstance(seed.get("schema_version"), int)
    ids = [w["id"] for w in seed["words"]]
    assert len(ids) == len(set(ids)), "seed word ids must be unique"
    for w in seed["words"]:
        assert len(w["drill_caps"]) >= 2
        assert ("k2r" in w["drill_caps"]) == (w["kanji"] is not None)
        assert w["visibility"] == "shared"
