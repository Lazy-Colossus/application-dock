"""Offline enrichment: fill the `type` column in scripts/kaishi_raw.json.

Run manually after re-extracting the deck (this is NOT part of the served app):

    python backend/scripts/derive_kaishi_pos.py

The Kaishi deck ships no part of speech, so it is worked out here rather than at
build time: `kaishi_raw.json` then carries `type` the way `genki_raw.json` does,
and the seed builder stays a plain transform over its inputs.

Three things decide a row, in order: a hand-read judgement in `kaishi_pos.json`,
an exact match against Genki, then the word's own morphology. Whatever none of
them settles is a noun -- which is what the rest of the deck turned out to be
when it was read through. That default is only sound for rows that HAVE been
read: a newer deck's additions need judging, not assuming.
"""

import json
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
_KAISHI_RAW_PATH = _SCRIPT_DIR / "kaishi_raw.json"
_GENKI_RAW_PATH = _SCRIPT_DIR / "genki_raw.json"
_CURATED_PATH = _SCRIPT_DIR / "kaishi_pos.json"

DEFAULT_POS = "noun"

_GODAN_ENDINGS = "うくぐすつぬぶむ"
# The mora before る decides ichidan vs godan. An i/e sound reads as ichidan --
# 見る, 食べる -- with a closed set of godan exceptions that wear the same shape.
_IE_KANA = set("いきしちにひみりぎじぢびぴえけせてねへめれげぜでべぺ")

# Godan verbs that look ichidan. Keyed by surface form, never by reading: 帰る
# (godan) and 変える (ichidan) are both かえる, and the reading alone would hand
# 変える the wrong conjugation.
_GODAN_LOOKALIKES = frozenset(
    {
        "帰る",
        "入る",
        "気に入る",
        "走る",
        "切る",
        "裏切る",
        "知る",
        "要る",
        "減る",
        "握る",
        "焦る",
        "参る",
        "限る",
        "蹴る",
        "練る",
        "喋る",
        "滑る",
        "散る",
        "照る",
        "混じる",
    }
)

# Verb-stem nouns (and one な-adjective) written with the same trailing い as a
# real adjective: 戦い "a battle" is shaped exactly like 熱い "hot". Nothing in
# the row tells them apart, so they are named rather than inferred.
_NOT_I_ADJECTIVE = frozenset(
    {
        "嫌い",
        "お願い",
        "お互い",
        "思い",
        "戦い",
        "勢い",
        "匂い",
        "勘違い",
        "知り合い",
        "間違い",
        "違い",
        "願い",
        "呪い",
        "笑い",
    }
)


def genki_pos_lookup(rows: list[dict]) -> dict[tuple[str, str], str]:
    """Part of speech by (surface form, reading), read straight from genki_raw.json.

    Keyed on the pair, never the reading alone: 夜 (a noun) and 寄る (a verb) are
    both よる, and a reading-only match hands the noun's label to the verb.
    "kanji" and "kanji-word" are dropped -- they say where a Genki entry came
    from, not what part of speech it is.
    """
    return {
        (row["kanji"] or row["hiragana"], row["hiragana"]): row["type"]
        for row in rows
        if row["type"] and row["type"] not in {"kanji", "kanji-word"}
    }


def inferred_pos(row: dict, lookup: dict[tuple[str, str], str]) -> str:
    """Part of speech from evidence alone, or "" when nothing settles it.

    An exact Genki match wins; otherwise the word's own morphology decides. Where
    the two overlap they agree on every row in the deck.
    """
    word, reading, meaning = row["word"], row["reading"], row["meaning"]
    known = lookup.get((word, reading))
    if known:
        return known

    if meaning.startswith("to "):
        # A verb gloss is not enough on its own -- あくまで "to the end" opens the
        # same way -- so the ending has to agree before anything is claimed.
        if reading == "くる" or reading.endswith(("てくる", "でくる", "する")):
            return "irregular-verb"
        if reading.endswith("る"):
            if len(reading) > 1 and reading[-2] in _IE_KANA:
                return "u-verb" if word in _GODAN_LOOKALIKES else "ru-verb"
            return "u-verb"
        return "u-verb" if reading[-1] in _GODAN_ENDINGS else ""

    # Okurigana: an i-adjective is written with its trailing い, which a noun
    # like 時計 (とけい) is not -- so the kanji requirement does the real work.
    if (
        word.endswith("い")
        and reading.endswith("い")
        and word not in _NOT_I_ADJECTIVE
        and any("一" <= c <= "鿿" for c in word)
    ):
        return "i-adjective"
    return ""


def curated_pos() -> dict[int, str]:
    """Hand-read judgements, keyed by the row's `order` in the deck.

    What no rule can settle was read by hand once -- adverbs, な-adjectives, the
    kana i-adjectives the okurigana test structurally cannot see, set phrases,
    counters. The file stores each word beside its label so a reviewer can check
    the call against the row it lands on.
    """
    raw = json.loads(_CURATED_PATH.read_text(encoding="utf-8"))
    return {int(order): entry["pos"] for order, entry in raw.items()}


def pos_for(row: dict, lookup: dict[tuple[str, str], str], curated: dict[int, str]) -> str:
    """A hand-read call outranks a heuristic; anything left over is a noun."""
    return curated.get(row["order"]) or inferred_pos(row, lookup) or DEFAULT_POS


def annotate(rows: list[dict], genki_rows: list[dict]) -> list[dict]:
    """Return the rows with `type` filled in, key order matching genki_raw.json."""
    lookup = genki_pos_lookup(genki_rows)
    curated = curated_pos()
    return [
        {
            "order": row["order"],
            "word": row["word"],
            "reading": row["reading"],
            "meaning": row["meaning"],
            "type": pos_for(row, lookup, curated),
        }
        for row in rows
    ]


def main() -> None:
    rows = json.loads(_KAISHI_RAW_PATH.read_text(encoding="utf-8"))
    genki_raw = json.loads(_GENKI_RAW_PATH.read_text(encoding="utf-8"))
    annotated = annotate(rows, genki_raw)
    _KAISHI_RAW_PATH.write_text(
        json.dumps(annotated, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    typed = sum(1 for r in annotated if r["type"])
    print(f"Annotated {typed}/{len(annotated)} rows in {_KAISHI_RAW_PATH}")


if __name__ == "__main__":
    main()
