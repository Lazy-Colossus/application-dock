"""Tests for the offline part-of-speech derivation (scripts/derive_kaishi_pos.py)."""

import json
from pathlib import Path

import pytest

from scripts.derive_kaishi_pos import (
    annotate,
    genki_pos_lookup,
    pos_for,
)
from scripts.derive_kaishi_pos import (
    inferred_pos as kaishi_pos,
)

_RAW_FILE = Path(__file__).resolve().parent.parent / "scripts" / "kaishi_raw.json"
_CURATED_FILE = Path(__file__).resolve().parent.parent / "scripts" / "kaishi_pos.json"


def _row(word: str, reading: str, meaning: str) -> dict:
    return {"order": 1, "word": word, "reading": reading, "meaning": meaning}


@pytest.mark.parametrize(
    ("word", "reading", "meaning", "expected"),
    [
        # Endings that can only be godan.
        ("行く", "いく", "to go", "u-verb"),
        ("泳ぐ", "およぐ", "to swim", "u-verb"),
        ("話す", "はなす", "to speak", "u-verb"),
        # る after an a/u/o sound is godan too.
        ("分かる", "わかる", "to understand", "u-verb"),
        # After an i/e sound the default is ichidan...
        ("変える", "かえる", "to change", "ru-verb"),
        ("信じる", "しんじる", "to believe", "ru-verb"),
        # ...with a closed set of godan lookalikes, told apart by surface form:
        # 帰る and 変える are both かえる but conjugate differently.
        ("帰る", "かえる", "to return", "u-verb"),
        ("走る", "はしる", "to run", "u-verb"),
        ("気に入る", "きにいる", "to like", "u-verb"),
        ("来る", "くる", "to come", "irregular-verb"),
        ("持ってくる", "もってくる", "to bring", "irregular-verb"),
        ("愛する", "あいする", "to love", "irregular-verb"),
        # A verb gloss with a non-verb ending is not a verb.
        ("あくまで", "あくまで", "to the end, persistently", ""),
        # Okurigana marks an i-adjective; a noun read the same way lacks it.
        ("熱い", "あつい", "hot (things, touch)", "i-adjective"),
        ("時計", "とけい", "clock, watch", ""),
        # Verb-stem nouns wear the same trailing い and are excluded by name.
        ("戦い", "たたかい", "war, battle", ""),
        ("嫌い", "きらい", "dislike", ""),
        # Nothing to go on at all.
        ("空気", "くうき", "atmosphere, air", ""),
    ],
)
def test_kaishi_pos(word: str, reading: str, meaning: str, expected: str) -> None:
    assert kaishi_pos(_row(word, reading, meaning), {}) == expected


def test_kaishi_pos_prefers_an_exact_genki_match() -> None:
    # 帰る is godan despite the え before る — morphology alone would decline to
    # say, but Genki knows it.
    lookup = {("帰る", "かえる"): "u-verb", ("食べる", "たべる"): "ru-verb"}
    assert kaishi_pos(_row("帰る", "かえる", "to return"), lookup) == "u-verb"
    assert kaishi_pos(_row("食べる", "たべる", "to eat"), lookup) == "ru-verb"


def test_genki_lookup_is_keyed_on_the_pair_not_the_reading() -> None:
    # 夜 and 寄る are both よる. Keying on the reading alone would label the verb
    # a noun.
    lookup = genki_pos_lookup(
        [
            {"kanji": "夜", "hiragana": "よる", "type": "noun"},
            {"kanji": "", "hiragana": "あるく", "type": "u-verb"},
            # Where a Genki row came from is not a part of speech.
            {"kanji": "山", "hiragana": "やま", "type": "kanji-word"},
        ]
    )
    assert lookup == {("夜", "よる"): "noun", ("あるく", "あるく"): "u-verb"}
    assert kaishi_pos(_row("寄る", "よる", "to drop by"), lookup) == "u-verb"


def test_curated_judgements_still_point_at_the_words_they_were_read_for() -> None:
    # The file is hand-written and keyed by deck position, so a reshuffled or
    # re-extracted deck must fail loudly rather than relabel the wrong rows.
    curated = json.loads(_CURATED_FILE.read_text(encoding="utf-8"))
    rows = {r["order"]: r for r in json.loads(_RAW_FILE.read_text(encoding="utf-8"))}
    for order, entry in curated.items():
        row = rows.get(int(order))
        assert row is not None, f"deck has no row {order}"
        assert entry["word"] in (row["word"], row["reading"])
        assert row["type"] == entry["pos"]


def test_annotate_fills_every_row_and_prefers_a_hand_read_call() -> None:
    rows = [
        {"order": 1, "word": "走る", "reading": "はしる", "meaning": "to run"},
        {"order": 2, "word": "空気", "reading": "くうき", "meaning": "atmosphere, air"},
    ]
    annotated = annotate(rows, [])
    assert [r["type"] for r in annotated] == ["u-verb", "noun"]
    # Key order matches genki_raw.json's rows.
    assert list(annotated[0]) == ["order", "word", "reading", "meaning", "type"]


def test_pos_for_puts_a_hand_read_call_above_the_rules() -> None:
    row = {"order": 7, "word": "結構", "reading": "けっこう", "meaning": "quite"}
    assert pos_for(row, {}, {}) == "noun"  # nothing to go on -> the default
    assert pos_for(row, {}, {7: "adverb"}) == "adverb"
