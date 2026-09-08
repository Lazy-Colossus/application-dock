"""Offline extraction: Kaishi 1.5k Anki deck -> raw Hotaru vocab rows.

Run manually when the deck is updated (this is NOT part of the served app):

    python backend/scripts/extract_kaishi_apkg.py ~/Downloads/"Kaishi 1.5k Basic Japanese Vocabulary.apkg"

An .apkg is a zip holding `collection.anki21`, a SQLite database whose `notes.flds`
column packs every field into one 0x1f-separated string. Only the four fields the
seed needs are kept; audio, pictures, pitch accent and example sentences are dropped.

The deck has no part of speech, so `type` is worked out separately (see
derive_kaishi_pos.py). Any `type` already recorded for a word is carried across a
re-extraction rather than thrown away; words the new deck adds come out blank, and
running the derivation afterwards fills them.
"""

import argparse
import html
import json
import sqlite3
import sys
import tempfile
import zipfile
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
_RAW_PATH = _SCRIPT_DIR / "kaishi_raw.json"

_MODEL = "Kaishi 1.5k"
_DB_ENTRY = "collection.anki21"


def field_names(con: sqlite3.Connection, model_name: str) -> list[str]:
    """Field order for a note model, which is what `notes.flds` is packed in."""
    models = json.loads(con.execute("select models from col").fetchone()[0])
    for model in models.values():
        if model["name"] == model_name:
            return [f["name"] for f in model["flds"]]
    raise ValueError(f"Note model {model_name!r} not found in deck")


def clean(text: str) -> str:
    """Anki stores fields as HTML; `&nbsp;` is the only entity this deck uses."""
    return html.unescape(text).replace(" ", " ").strip()


def existing_types(path: Path) -> dict[tuple[str, str, str], str]:
    """`type` from a previous run, by (word, reading, meaning) -- the deck's `order`
    shifts when entries are added, but a row's own content identifies it."""
    if not path.exists():
        return {}
    rows = json.loads(path.read_text(encoding="utf-8"))
    return {(r["word"], r["reading"], r["meaning"]): r["type"] for r in rows if r.get("type")}


def extract(apkg: Path) -> list[dict]:
    """Deck-ordered rows. Note id is insertion order, i.e. the intended study order.

    The deck's first note is a "Welcome to Kaishi 1.5k!" card with no reading — it is
    signage, not vocabulary, so rows without a reading are skipped.
    """
    with zipfile.ZipFile(apkg) as z, tempfile.TemporaryDirectory() as tmp:
        db = Path(tmp) / _DB_ENTRY
        db.write_bytes(z.read(_DB_ENTRY))
        con = sqlite3.connect(db)
        try:
            names = field_names(con, _MODEL)
            packed = [r[0] for r in con.execute("select flds from notes order by id")]
        finally:
            con.close()

    known = existing_types(_RAW_PATH)
    rows: list[dict] = []
    for flds in packed:
        note = dict(zip(names, flds.split("\x1f"), strict=True))
        reading = clean(note["Word Reading"])
        if not reading:
            continue
        word, meaning = clean(note["Word"]), clean(note["Word Meaning"])
        rows.append(
            {
                "order": len(rows) + 1,
                "word": word,
                "reading": reading,
                "meaning": meaning,
                "type": known.get((word, reading, meaning), ""),
            }
        )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apkg", type=Path, help="path to the Kaishi 1.5k .apkg export")
    args = parser.parse_args()
    if not args.apkg.exists():
        sys.exit(f"No such file: {args.apkg}")

    rows = extract(args.apkg)
    _RAW_PATH.write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Wrote {len(rows)} rows to {_RAW_PATH}")


if __name__ == "__main__":
    main()
