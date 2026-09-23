"""Offline enrichment for KitchenCraft — read the collection, then fill its gaps.

Run manually. This is NOT part of the served app and has no HTTP surface (PRD
Q1): it goes through the app's repository layer, so it takes the same per-file
locks the app takes and writes through the same atomic path.

    # Development
    cd backend && DATA_DIR=./local-data .venv/bin/python -m scripts.enrich report --user nell

    # Production — inside the running container, which is the only place the
    # lock is shared with the app's own workers. See the runbook beside this file.
    docker compose exec app python -m scripts.enrich report --user nell

Two commands, and the LLM sits between them rather than inside either:

    report   what the collection is missing, plus the wording it already uses
    apply    a batch of inferred values, addressed by recipe id

`apply` writes nothing without `--write`. The dry run and the real run take the
same code path through `kitchencraft_service._apply_batch`, so what a dry run
reports is what a real run does.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

# The script imports the app, so `backend/` has to be importable. Running it as
# `python -m scripts.enrich` from `backend/` is the documented form; this makes
# a direct `python backend/scripts/enrich.py` work too.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services import kitchencraft_service as service  # noqa: E402


def _load_document(username: str) -> None:
    """Read the user's document once, up front, so a bad one stops the run.

    A document whose `schema_version` is unknown, or whose contents fail
    validation, must stop everything before a single write — the body is the
    irreplaceable asset (NFR-3), and a partially-understood document is not
    something to write back.
    """
    service.get_vocabulary(username)


def cmd_report(args: argparse.Namespace) -> int:
    report = service.enrichment_report(args.user)
    text = json.dumps(report, indent=2, ensure_ascii=False)

    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
        print(
            f"{report['needing_attention']} of {report['recipe_count']} recipes "
            f"need attention — written to {args.out}"
        )
    else:
        print(text)
    return 0


def _summarise(result: dict[str, Any], updates: dict[str, Any]) -> str:
    verb = "applied" if result["write"] else "would apply"
    lines = [
        f"{len(updates)} recipes in batch",
        f"  {verb}:   {len(result['applied'])}",
        f"  unchanged: {len(result['unchanged'])}",
    ]
    if result["unknown"]:
        lines.append(f"  UNKNOWN ID: {len(result['unknown'])} — {', '.join(result['unknown'])}")
    if result["skipped"]:
        lines.append(f"  left alone (user-set): {len(result['skipped'])}")
        for recipe_id, fields in sorted(result["skipped"].items()):
            lines.append(f"      {recipe_id}: {', '.join(fields)}")
    if not result["write"]:
        lines.append("\nNothing was written. Re-run with --write to apply.")
    return "\n".join(lines)


def cmd_apply(args: argparse.Namespace) -> int:
    raw = json.loads(Path(args.batch).read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        print("batch must be a JSON object keyed by recipe id", file=sys.stderr)
        return 2

    before = service.get_vocabulary(args.user)
    result = service.apply_enrichment(args.user, raw, write=args.write)
    print(_summarise(result, raw))

    if args.write:
        # Story 4.4: wording introduced by this run, named so drift is visible
        # immediately rather than discovered months later.
        after = service.get_vocabulary(args.user)
        _report_new_wording("tags", before.tags, after.tags)
        _report_new_wording("ingredients", before.ingredients, after.ingredients)

    # An unknown id is a real failure of the batch, even though the rest applied.
    return 1 if result["unknown"] else 0


def _report_new_wording(label: str, before: list[str], after: list[str]) -> None:
    known = {v.casefold() for v in before}
    new = [v for v in after if v.casefold() not in known]
    if new:
        print(f"\nNew {label} introduced by this run ({len(new)}):")
        for value in new:
            print(f"  + {value}")
        print("  Check these against the existing wording before the next pass.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="scripts.enrich",
        description="Offline enrichment for a KitchenCraft collection.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    report = sub.add_parser("report", help="what the collection is missing")
    report.add_argument("--user", required=True)
    report.add_argument("--out", help="write the report here instead of stdout")
    report.set_defaults(func=cmd_report)

    apply_ = sub.add_parser("apply", help="apply a batch of inferred values")
    apply_.add_argument("--user", required=True)
    apply_.add_argument("--batch", required=True, help="JSON file keyed by recipe id")
    apply_.add_argument(
        "--write",
        action="store_true",
        help="actually write. Without this the run reports and changes nothing.",
    )
    apply_.set_defaults(func=cmd_apply)

    args = parser.parse_args(argv)

    try:
        _load_document(args.user)
    except Exception as exc:  # noqa: BLE001 — any bad document must stop the run
        print(f"Refusing to run: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2

    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
