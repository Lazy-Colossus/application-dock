"""Offline build tool: raw vocabulary lists -> prepared Hotaru seed dataset.

Run manually (this is NOT part of the served app):

    python backend/scripts/build_hotaru_seed.py

Reads scripts/genki_raw.json, scripts/kaishi_raw.json (see extract_kaishi_apkg.py)
and scripts/tea_raw.json, assigns stable word IDs and drill_caps, and writes the
read-only seed to app/hotaru_seed/vocab_seed.json (committed, shipped in the image).
"""

import json
from collections import Counter
from pathlib import Path

SCHEMA_VERSION = 1

_SCRIPT_DIR = Path(__file__).resolve().parent
_RAW_PATH = _SCRIPT_DIR / "genki_raw.json"
_KAISHI_RAW_PATH = _SCRIPT_DIR / "kaishi_raw.json"
_TEA_RAW_PATH = _SCRIPT_DIR / "tea_raw.json"
_SEED_PATH = _SCRIPT_DIR.parent / "app" / "hotaru_seed" / "vocab_seed.json"

KAISHI_SOURCE = "kaishi"
TEA_SOURCE = "tea"
# The deck is one flat list in study order; the library needs subsections, so it is cut
# into bands of this size ("1-100", "101-200", ...).
KAISHI_LESSON_SIZE = 100

_SOKUON = "っ"
_LONG_MARK = "ー"
_ALT_READING_SEP = "・"
_KATAKANA_TO_HIRAGANA_OFFSET = ord("ぁ") - ord("ァ")

# Modified Hepburn, but transliterating the kana as written (は stays "ha", を stays
# "wo") and writing long vowels as repeated letters — the convention the hand-written
# Genki romaji already follows, e.g. こんにちは -> "konnichiha".
# fmt: off  — the gojūon grid is checkable by eye in rows; one mora per line is not.
_ROMAJI: dict[str, str] = {
    "あ": "a",
    "い": "i",
    "う": "u",
    "え": "e",
    "お": "o",
    "か": "ka",
    "き": "ki",
    "く": "ku",
    "け": "ke",
    "こ": "ko",
    "が": "ga",
    "ぎ": "gi",
    "ぐ": "gu",
    "げ": "ge",
    "ご": "go",
    "さ": "sa",
    "し": "shi",
    "す": "su",
    "せ": "se",
    "そ": "so",
    "ざ": "za",
    "じ": "ji",
    "ず": "zu",
    "ぜ": "ze",
    "ぞ": "zo",
    "た": "ta",
    "ち": "chi",
    "つ": "tsu",
    "て": "te",
    "と": "to",
    "だ": "da",
    "ぢ": "ji",
    "づ": "zu",
    "で": "de",
    "ど": "do",
    "な": "na",
    "に": "ni",
    "ぬ": "nu",
    "ね": "ne",
    "の": "no",
    "は": "ha",
    "ひ": "hi",
    "ふ": "fu",
    "へ": "he",
    "ほ": "ho",
    "ば": "ba",
    "び": "bi",
    "ぶ": "bu",
    "べ": "be",
    "ぼ": "bo",
    "ぱ": "pa",
    "ぴ": "pi",
    "ぷ": "pu",
    "ぺ": "pe",
    "ぽ": "po",
    "ま": "ma",
    "み": "mi",
    "む": "mu",
    "め": "me",
    "も": "mo",
    "や": "ya",
    "ゆ": "yu",
    "よ": "yo",
    "ら": "ra",
    "り": "ri",
    "る": "ru",
    "れ": "re",
    "ろ": "ro",
    "わ": "wa",
    "ゐ": "i",
    "ゑ": "e",
    "を": "wo",
    "ん": "n",
    "ぁ": "a",
    "ぃ": "i",
    "ぅ": "u",
    "ぇ": "e",
    "ぉ": "o",
    "ゃ": "ya",
    "ゅ": "yu",
    "ょ": "yo",
    "ゎ": "wa",
    "きゃ": "kya",
    "きゅ": "kyu",
    "きょ": "kyo",
    "ぎゃ": "gya",
    "ぎゅ": "gyu",
    "ぎょ": "gyo",
    "しゃ": "sha",
    "しゅ": "shu",
    "しょ": "sho",
    "じゃ": "ja",
    "じゅ": "ju",
    "じょ": "jo",
    "ちゃ": "cha",
    "ちゅ": "chu",
    "ちょ": "cho",
    "ぢゃ": "ja",
    "ぢゅ": "ju",
    "ぢょ": "jo",
    "にゃ": "nya",
    "にゅ": "nyu",
    "にょ": "nyo",
    "ひゃ": "hya",
    "ひゅ": "hyu",
    "ひょ": "hyo",
    "びゃ": "bya",
    "びゅ": "byu",
    "びょ": "byo",
    "ぴゃ": "pya",
    "ぴゅ": "pyu",
    "ぴょ": "pyo",
    "みゃ": "mya",
    "みゅ": "myu",
    "みょ": "myo",
    "りゃ": "rya",
    "りゅ": "ryu",
    "りょ": "ryo",
    "てぃ": "ti",
    "でぃ": "di",
    "とぅ": "tu",
    "どぅ": "du",
    "ふぁ": "fa",
    "ふぃ": "fi",
    "ふぇ": "fe",
    "ふぉ": "fo",
    "うぃ": "wi",
    "うぇ": "we",
    "うぉ": "wo",
    "ゔぁ": "va",
    "ゔぃ": "vi",
    "ゔ": "vu",
    "ゔぇ": "ve",
    "ゔぉ": "vo",
    "しぇ": "she",
    "じぇ": "je",
    "ちぇ": "che",
}
# fmt: on

_VOWELS = "aiueo"


def _to_hiragana(kana: str) -> str:
    """Fold katakana onto hiragana so one table serves both. `ー` is left alone."""
    return "".join(
        chr(ord(c) + _KATAKANA_TO_HIRAGANA_OFFSET) if "ァ" <= c <= "ヶ" else c for c in kana
    )


def _romanise(kana: str) -> str:
    out: list[str] = []
    pending_sokuon = False
    i = 0
    while i < len(kana):
        digraph = kana[i : i + 2]
        if digraph in _ROMAJI:
            mora, step = _ROMAJI[digraph], 2
        elif kana[i] == _SOKUON:
            pending_sokuon = True
            i += 1
            continue
        elif kana[i] == _LONG_MARK:
            last_vowel = next((c for c in reversed("".join(out)) if c in _VOWELS), "")
            out.append(last_vowel)
            i += 1
            continue
        else:
            mora, step = _ROMAJI.get(kana[i], kana[i]), 1

        if pending_sokuon:
            # Hepburn doubles the following consonant, but writes っち as "tchi". A っ with
            # no mora after it (a counter stem like いっ) doubles nothing and is dropped.
            if mora[:1].isalpha():
                mora = ("t" + mora) if mora.startswith("ch") else (mora[0] + mora)
            pending_sokuon = False
        out.append(mora)
        i += step
    return "".join(out)


def to_romaji(reading: str) -> str:
    """Transliterate a kana reading. Alternate readings (なに・なん) keep their separator."""
    parts = _to_hiragana(reading).split(_ALT_READING_SEP)
    return _ALT_READING_SEP.join(_romanise(p) for p in parts)


def drill_caps(kanji: str | None) -> list[str]:
    """Drill modes a word supports. Reading + meaning are always present, so every
    word is at least r2m + m2r; k2r is added only when the word has kanji."""
    caps = ["r2m", "m2r"]
    if kanji is not None:
        caps.append("k2r")
    return caps


def check_unique(words: list[dict]) -> None:
    """Raise ValueError if any word id repeats. IDs are references for user progress
    and notes, so a collision must fail the build loudly rather than overwrite."""
    dupes = sorted(wid for wid, count in Counter(w["id"] for w in words).items() if count > 1)
    if dupes:
        raise ValueError(f"Duplicate word id(s) in seed: {', '.join(dupes)}")


def _word_from_row(row: dict, source: str, word_id: str) -> dict:
    kanji = row["kanji"] or None
    return {
        "id": word_id,
        "source": source,
        "reading": row["hiragana"],
        "kanji": kanji,
        "romaji": row["romaji"],
        "meaning": row["english"],
        "pos": row["type"],
        "lesson": str(row["lesson"]),
        "visibility": "shared",
        "drill_caps": drill_caps(kanji),
    }


def build_seed(raw: list[dict], schema_version: int = SCHEMA_VERSION) -> dict:
    """Transform raw Genki rows into the seed envelope with stable IDs.

    ID = "{source}-{lesson}-{seq:04d}" where source = "genki_{edition}" and seq is the
    1-based ordinal within each (source, lesson) group under a deterministic sort, so
    the same input always yields the same IDs regardless of row order.
    """

    def group_key(row: dict) -> tuple[str, str]:
        return (f"genki_{row['edition']}", str(row["lesson"]))

    def sort_key(row: dict) -> tuple[str, str, str]:
        return (row["hiragana"], row["kanji"] or "", row["english"])

    words: list[dict] = []
    seq_by_group: dict[tuple[str, str], int] = {}
    for row in sorted(raw, key=lambda r: (group_key(r), sort_key(r))):
        source, lesson = group_key(row)
        seq = seq_by_group.get((source, lesson), 0) + 1
        seq_by_group[(source, lesson)] = seq
        words.append(_word_from_row(row, source, f"{source}-{lesson}-{seq:04d}"))

    check_unique(words)
    return {"schema_version": schema_version, "words": words}


def kaishi_kanji(word: str) -> str | None:
    """The deck's surface form is the kanji spelling only when it actually holds kanji;
    パン (reading ぱん) and テレビ are kana words, not kanji ones."""
    return word if any("一" <= c <= "鿿" for c in word) else None


def kaishi_lesson(order: int) -> str:
    """Band label for a word's position in the deck's study order, e.g. 1 -> "1-100"."""
    start = (order - 1) // KAISHI_LESSON_SIZE * KAISHI_LESSON_SIZE + 1
    return f"{start}-{start + KAISHI_LESSON_SIZE - 1}"


def build_kaishi(raw: list[dict]) -> list[dict]:
    """Transform raw Kaishi 1.5k rows into seed words.

    `order` is the deck's study order, so it fixes both the lesson band and the sequence
    within it — IDs are stable no matter how the rows arrive. `type` is carried over as
    `pos`, the way a Genki row's is; see derive_kaishi_pos.py for where it comes from.
    Romaji is derived from the kana reading, which the deck does not carry either.
    """
    words: list[dict] = []
    seq_by_lesson: dict[str, int] = {}
    for row in sorted(raw, key=lambda r: r["order"]):
        lesson = kaishi_lesson(row["order"])
        seq = seq_by_lesson.get(lesson, 0) + 1
        seq_by_lesson[lesson] = seq
        word_id = f"{KAISHI_SOURCE}-{lesson}-{seq:04d}"
        kanji = kaishi_kanji(row["word"])
        words.append(
            {
                "id": word_id,
                "source": KAISHI_SOURCE,
                "reading": row["reading"],
                "kanji": kanji,
                "romaji": to_romaji(row["reading"]),
                "meaning": row["meaning"],
                "pos": row.get("type", ""),
                "lesson": lesson,
                "visibility": "shared",
                "drill_caps": drill_caps(kanji),
            }
        )
    return words


def build_tea(raw: list[dict]) -> list[dict]:
    """Transform raw Japanese tea glossary rows into seed words.

    Unlike the textbooks, this source has no study order, so `lesson` is a theme the
    row already carries ("types", "process", "ceremony", "taste", "spirit") and the
    sequence within it comes from a deterministic sort — the Genki approach. Romaji is
    carried over rather than derived: these are romanised names as the glossaries print
    them ("shira-ore", "wakei seijaku"), which a kana transliteration would not produce.
    """
    words: list[dict] = []
    seq_by_lesson: dict[str, int] = {}
    for row in sorted(raw, key=lambda r: (r["lesson"], r["reading"], r["kanji"])):
        lesson = row["lesson"]
        seq = seq_by_lesson.get(lesson, 0) + 1
        seq_by_lesson[lesson] = seq
        kanji = row["kanji"] or None
        words.append(
            {
                "id": f"{TEA_SOURCE}-{lesson}-{seq:04d}",
                "source": TEA_SOURCE,
                "reading": row["reading"],
                "kanji": kanji,
                "romaji": row["romaji"],
                "meaning": row["meaning"],
                "pos": row["type"],
                "lesson": lesson,
                "visibility": "shared",
                "drill_caps": drill_caps(kanji),
            }
        )
    return words


def build_all(
    genki_raw: list[dict],
    kaishi_raw: list[dict],
    tea_raw: list[dict],
    schema_version: int = SCHEMA_VERSION,
) -> dict:
    """The full shipped seed: every source in one envelope, ids unique across all."""
    words = (
        build_seed(genki_raw, schema_version)["words"]
        + build_kaishi(kaishi_raw)
        + build_tea(tea_raw)
    )
    check_unique(words)
    return {"schema_version": schema_version, "words": words}


def main() -> None:
    genki_raw = json.loads(_RAW_PATH.read_text(encoding="utf-8"))
    kaishi_raw = json.loads(_KAISHI_RAW_PATH.read_text(encoding="utf-8"))
    tea_raw = json.loads(_TEA_RAW_PATH.read_text(encoding="utf-8"))
    seed = build_all(genki_raw, kaishi_raw, tea_raw)
    _SEED_PATH.parent.mkdir(parents=True, exist_ok=True)
    _SEED_PATH.write_text(json.dumps(seed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(seed['words'])} words to {_SEED_PATH}")


if __name__ == "__main__":
    main()
