# KitchenCraft enrichment — runbook

How to run `enrich.py` against a real collection, in development and in
production. The decisions behind it are in
[`docs/planning-artifacts/architectures/kitchencraft-enrichment-2026-09-15.md`](../../docs/planning-artifacts/architectures/kitchencraft-enrichment-2026-09-15.md).

**The LLM is not in the script.** It sits between the two commands: `report`
tells you what is missing, you (or Claude Code) work out the values, `apply`
writes them. Nothing here calls an API, and no API key is needed.

## Before you start

- **Run it inside the container in production.** The per-file locks are
  process-local, so a host-side process and the app's workers would not see each
  other's locks at all. Inside the container is the only place the lock is real.
- **`apply` writes nothing without `--write`.** The dry run and the real run take
  the same code path, so what the dry run reports is what the real run does.
- **The body is never touched.** Not by any command, in any mode.

## Development

```bash
cd backend
export DATA_DIR=./local-data

# 1. What is missing, and what wording the collection already uses
.venv/bin/python -m scripts.enrich report --user nell --out /tmp/report.json

# 2. Work out the values. Give Claude Code /tmp/report.json and ask for a batch.
#    Write it to /tmp/batch.json (see "Batch format" below).

# 3. See what would happen. Writes nothing.
.venv/bin/python -m scripts.enrich apply --user nell --batch /tmp/batch.json

# 4. Do it.
.venv/bin/python -m scripts.enrich apply --user nell --batch /tmp/batch.json --write
```

## Production

The app image already contains `backend/scripts/`, so there is nothing to copy.

```bash
# 1. Report, out to a file inside the container, then copy it to the host to read
docker compose exec app python -m scripts.enrich report --user nell --out /tmp/report.json
docker compose cp app:/tmp/report.json ./report.json

# 2. Work out the values on the host. Write ./batch.json.

# 3. Copy the batch in and dry-run it
docker compose cp ./batch.json app:/tmp/batch.json
docker compose exec app python -m scripts.enrich apply --user nell --batch /tmp/batch.json

# 4. Apply
docker compose exec app python -m scripts.enrich apply --user nell --batch /tmp/batch.json --write
```

`docker compose cp` is used for the **report and the batch** — never for the data
document itself. Copying the document out, editing it and copying it back is not
a read-modify-write under lock, and would silently discard anything the app wrote
in between.

## Batch format

A JSON object keyed by **recipe id**, never by name — a batch must still land
after the user has renamed something.

```jsonc
{
  "r-13a77c8e": {
    "meal_type": "dinner",          // one of: breakfast dinner dessert
    "total_time_minutes": 60,       // positive integer
    "servings": 6,
    "source": "Ottolenghi, Jerusalem",
    "tags": ["batch-cook"],         // added, never removed
    "ingredients": [                // only written if the recipe has none
      { "amount": "400", "unit": "g", "text": "dried chickpeas" },
      { "text": "harissa" }
    ]
  }
}
```

Every key is optional. Omitting a key leaves that field alone.

`rating` is ignored if you send it — a rating is a judgement only the cook can
make.

## What it will refuse to do

| Situation | What happens |
|---|---|
| A field the user set by hand | Left alone, and the skip is reported |
| A recipe whose ingredients the user wrote | Left entirely alone — adding to a hand-written list is editing their work, not filling a gap |
| An id that is not in the collection | Reported; the rest of the batch still applies; **exit code 1** |
| A document with an unknown `schema_version` | **Exit code 2**, nothing read further, nothing written |
| An invalid number (`servings: 0`) | Raises; the transaction does not complete, so nothing is written |
| The same batch run twice | A no-op. No duplicated tags, no churned `updated_at` |

A value the *previous pass* wrote is not protected — a guess is not a decision,
and a later pass may improve on it. Only the user's own values are untouchable.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Fine |
| 1 | Ran, but the batch named at least one unknown id |
| 2 | Refused to run, or the batch was malformed. Nothing was read or written |

## After a run

`apply --write` prints any **new tags or ingredients** the run introduced. Read
that list. It is the drift check: if the run coined `chicken meat` when the
collection already says `chicken`, fix it now rather than discovering it months
later.
