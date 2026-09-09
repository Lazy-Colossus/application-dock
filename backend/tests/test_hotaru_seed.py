"""Tests for the offline Hotaru seed builder (Story 1.1)."""

import json
from collections import Counter
from pathlib import Path

import pytest

from scripts.build_hotaru_seed import (
    build_all,
    build_kaishi,
    build_seed,
    build_tea,
    check_unique,
    drill_caps,
    kaishi_kanji,
    kaishi_lesson,
    to_romaji,
)

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


KAISHI_SAMPLE = [
    {
        "order": 1,
        "word": "私",
        "reading": "わたし",
        "meaning": "I (polite, general)",
        "type": "noun",
    },
    {"order": 2, "word": "あなた", "reading": "あなた", "meaning": "you", "type": "noun"},
    {"order": 100, "word": "学校", "reading": "がっこう", "meaning": "school", "type": "noun"},
    {"order": 101, "word": "パン", "reading": "ぱん", "meaning": "bread", "type": "noun"},
]


@pytest.mark.parametrize(
    ("reading", "expected"),
    [
        ("わたし", "watashi"),
        ("がっこう", "gakkou"),  # sokuon doubles the next consonant
        ("とっち", "totchi"),  # ...but っち is "tchi", not "cchi"
        ("しゃしん", "shashin"),  # digraph
        ("こんにちは", "konnichiha"),  # は transliterated as written, not as the particle
        ("テレビ", "terebi"),  # katakana folds onto the same table
        ("コンピューター", "konpyuutaa"),  # ー repeats the preceding vowel
        ("なに・なん", "nani・nan"),  # alternate readings keep their separator
        ("いっ", "i"),  # a counter stem's dangling っ doubles nothing
    ],
)
def test_to_romaji(reading: str, expected: str) -> None:
    assert to_romaji(reading) == expected


def test_kaishi_kanji_only_when_the_surface_form_has_kanji() -> None:
    assert kaishi_kanji("私") == "私"
    assert kaishi_kanji("パン") is None  # katakana word, reading ぱん
    assert kaishi_kanji("あなた") is None


@pytest.mark.parametrize(
    ("order", "lesson"),
    [(1, "1-100"), (100, "1-100"), (101, "101-200"), (1500, "1401-1500")],
)
def test_kaishi_lesson_bands(order: int, lesson: str) -> None:
    assert kaishi_lesson(order) == lesson


def test_kaishi_field_mapping_and_id_format() -> None:
    words = {w["reading"]: w for w in build_kaishi(KAISHI_SAMPLE)}
    watashi = words["わたし"]
    assert watashi["id"] == "kaishi-1-100-0001"
    assert watashi["source"] == "kaishi"
    assert watashi["kanji"] == "私"
    assert watashi["romaji"] == "watashi"
    assert watashi["meaning"] == "I (polite, general)"
    assert watashi["lesson"] == "1-100"
    assert watashi["visibility"] == "shared"
    assert watashi["drill_caps"] == ["r2m", "m2r", "k2r"]
    # `type` carries through as `pos`, the way a Genki row's does.
    assert watashi["pos"] == "noun"


def test_kaishi_seq_restarts_in_each_band() -> None:
    ids = {w["id"] for w in build_kaishi(KAISHI_SAMPLE)}
    assert ids == {
        "kaishi-1-100-0001",
        "kaishi-1-100-0002",
        "kaishi-1-100-0003",
        "kaishi-101-200-0001",
    }


def test_kaishi_pos_comes_from_the_row_and_is_not_invented() -> None:
    # The derivation lives in derive_kaishi_pos.py; a row that has not been through
    # it arrives here blank, and the builder leaves it that way.
    row = {"order": 1, "word": "空気", "reading": "くうき", "meaning": "air"}
    assert build_kaishi([row])[0]["pos"] == ""


def test_kaishi_ids_follow_deck_order_not_row_order() -> None:
    assert build_kaishi(KAISHI_SAMPLE) == build_kaishi(list(reversed(KAISHI_SAMPLE)))


def test_build_all_combines_sources_with_unique_ids() -> None:
    seed = build_all(SAMPLE, KAISHI_SAMPLE, TEA_SAMPLE)
    assert seed["schema_version"] == 1
    sources = {w["source"] for w in seed["words"]}
    assert sources == {"genki_3", "kaishi", "tea"}
    ids = [w["id"] for w in seed["words"]]
    assert len(ids) == len(set(ids))


def test_committed_seed_ships_every_source() -> None:
    seed = json.loads(_SEED_FILE.read_text(encoding="utf-8"))
    counts = Counter(w["source"] for w in seed["words"])
    assert counts["genki_3"] > 0
    assert counts["kaishi"] > 0
    assert counts["tea"] > 0


def test_every_seeded_kaishi_word_has_a_part_of_speech() -> None:
    seed = json.loads(_SEED_FILE.read_text(encoding="utf-8"))
    kaishi = [w for w in seed["words"] if w["source"] == "kaishi"]
    known = {
        "u-verb",
        "ru-verb",
        "irregular-verb",
        "i-adjective",
        "na-adjective",
        "noun",
        "adverb",
        "expression",
        "prefix",
        "suffix",
        "particle",
    }
    assert {w["pos"] for w in kaishi} <= known
    # Rules, then hand-read judgements, then the noun default: nothing is left over.
    assert all(w["pos"] for w in kaishi)


TEA_SAMPLE = [
    {
        "kanji": "煎茶",
        "reading": "せんちゃ",
        "romaji": "sencha",
        "meaning": "sencha — steamed, rolled and dried leaf",
        "type": "noun",
        "lesson": "types",
    },
    {
        "kanji": "玉露",
        "reading": "ぎょくろ",
        "romaji": "gyokuro",
        "meaning": "jade dew — top-grade shaded tea",
        "type": "noun",
        "lesson": "types",
    },
    {
        "kanji": "",
        "reading": "おもてなし",
        "romaji": "omotenashi",
        "meaning": "hospitality — sincere, selfless service",
        "type": "noun",
        "lesson": "spirit",
    },
]


def test_tea_field_mapping_and_id_format() -> None:
    words = {w["reading"]: w for w in build_tea(TEA_SAMPLE)}
    sencha = words["せんちゃ"]
    # Deterministic sort by reading puts ぎょくろ (0001) before せんちゃ (0002).
    assert sencha["id"] == "tea-types-0002"
    assert sencha["source"] == "tea"
    assert sencha["kanji"] == "煎茶"
    assert sencha["romaji"] == "sencha"
    assert sencha["pos"] == "noun"
    assert sencha["lesson"] == "types"
    assert sencha["visibility"] == "shared"
    assert sencha["drill_caps"] == ["r2m", "m2r", "k2r"]


def test_tea_kana_only_term_has_no_kanji_and_no_kanji_drill() -> None:
    words = {w["reading"]: w for w in build_tea(TEA_SAMPLE)}
    omotenashi = words["おもてなし"]
    assert omotenashi["kanji"] is None
    assert omotenashi["drill_caps"] == ["r2m", "m2r"]


def test_tea_seq_restarts_in_each_theme() -> None:
    ids = {w["id"] for w in build_tea(TEA_SAMPLE)}
    assert ids == {"tea-types-0001", "tea-types-0002", "tea-spirit-0001"}


def test_tea_ids_are_stable_regardless_of_row_order() -> None:
    assert build_tea(TEA_SAMPLE) == build_tea(list(reversed(TEA_SAMPLE)))


def test_tea_romaji_is_carried_over_not_transliterated() -> None:
    # Glossary spellings ("shira-ore") are not what a kana transliteration produces.
    row = dict(TEA_SAMPLE[0], reading="しらおれ", romaji="shira-ore", kanji="白折れ")
    assert build_tea([row])[0]["romaji"] == "shira-ore"


def test_committed_seed_tea_words_are_themed_and_glossed() -> None:
    seed = json.loads(_SEED_FILE.read_text(encoding="utf-8"))
    tea = [w for w in seed["words"] if w["source"] == "tea"]
    assert {w["lesson"] for w in tea} == {"types", "process", "ceremony", "taste", "spirit"}
    # Every gloss leads with the romanised name, so a card names the tea it describes.
    assert all(w["meaning"].lower().startswith(w["romaji"].lower()) for w in tea)
    assert all(w["pos"] for w in tea)
