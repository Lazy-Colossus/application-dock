"""Offline build tool: raw Genki vocab list -> prepared Hotaru seed dataset.

Run manually (this is NOT part of the served app):

    python backend/scripts/build_hotaru_seed.py

Reads scripts/genki_raw.json, assigns stable word IDs and drill_caps, and writes
the read-only seed to app/hotaru_seed/vocab_seed.json (committed, shipped in the image).
"""

import json
from collections import Counter
from pathlib import Path

SCHEMA_VERSION = 1

_SCRIPT_DIR = Path(__file__).resolve().parent
_RAW_PATH = _SCRIPT_DIR / "genki_raw.json"
_SEED_PATH = _SCRIPT_DIR.parent / "app" / "hotaru_seed" / "vocab_seed.json"


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


def main() -> None:
    raw = json.loads(_RAW_PATH.read_text(encoding="utf-8"))
    seed = build_seed(raw)
    _SEED_PATH.parent.mkdir(parents=True, exist_ok=True)
    _SEED_PATH.write_text(json.dumps(seed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(seed['words'])} words to {_SEED_PATH}")


if __name__ == "__main__":
    main()
