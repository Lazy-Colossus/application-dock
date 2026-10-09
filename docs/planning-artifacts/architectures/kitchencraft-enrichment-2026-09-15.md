---
title: "KitchenCraft — enrichment decisions (provenance, and reaching the volume)"
status: decided
created: 2026-09-15
closes:
  - "PRD §8 still-open 1 — distinguishing user-set from machine-set field values (FR-19/FR-21)"
  - "PRD §8 still-open 3 — reaching the data volume from the host"
---

# KitchenCraft — enrichment decisions

Story 4.1's first acceptance criterion asks that both decisions Epic 4 depends on
be **recorded in writing before implementation begins**. This is that record.

Neither was a free choice: one was constrained by what Story 1.2 already shipped,
the other by how the dock already deploys.

## 1. Provenance: a list of unconfirmed keys on the recipe

**Decided:** a recipe carries `unconfirmed: list[str]` — the keys of values an
enrichment pass wrote and the user has not since touched. Absence of a key means
user-set.

**Keys are:** `meal_type`, `total_time_minutes`, `servings`, `source`,
`tag:{value}`, `ingredient:{text}`.

### Why this shape

This is already the shipped schema. Story 1.2 put `unconfirmed` on `Recipe` and
`_drop_marks` in the service; what was missing was anything that *writes* marks,
which is Story 4.3's job. The decision here is to confirm the shape rather than
replace it.

Three alternatives were considered and rejected:

| Alternative | Rejected because |
|---|---|
| A parallel `machine_set` object mirroring the field structure | Two structures to keep in step, and the recipe becomes half metadata |
| A separate provenance document per user | A second file to lock, and provenance would be readable without the value it describes |
| Per-field wrapper objects (`{value, origin}`) | Rewrites every field's shape and every consumer, to answer a question only enrichment asks |

**The chosen shape is deliberately asymmetric.** It records the *exception*
(machine-set) rather than the rule (user-set), which is why it costs nothing on a
recipe nobody has enriched: the list is empty, and every value is the user's.

### Consequences

- **Pre-existing recipes need no migration.** They carry `unconfirmed: []`, which
  already means "everything here is user-set" — the safe default, and true, since
  the only writer so far has been the user.
- **A user edit retires the mark automatically.** `_drop_marks` removes a key when
  its value changes, and also when the value it described is gone — a mark for a
  tag no longer on the recipe describes nothing.
- **Tags and ingredients are marked individually**, not as a block, so enrichment
  can add a tag to a recipe whose other tags the user chose.
- **The rating is never marked and never written by enrichment.** It is a
  judgement only the cook can make (Story 2.7).

## 2. Reaching the volume: run inside the container

**Decided:** the enrichment script runs **inside the running container**, via
`docker compose exec`, against the live `DATA_DIR`. In development it runs
directly against a local `DATA_DIR`.

```bash
# Production
docker compose exec app python -m scripts.enrich report

# Development
cd backend && DATA_DIR=./local-data .venv/bin/python -m scripts.enrich report
```

### Why this, and not the alternatives

| Alternative | Rejected because |
|---|---|
| Bind-mount the volume to the host and run there | Two processes with different code versions writing the same files. The locks are in-process (`key_lock`), so a host process and the container would not see each other's locks at all — the one failure mode NFR-1 exists to prevent |
| `docker cp` out, edit, `docker cp` back | Not a read-modify-write under lock. Anything the app wrote in between is silently overwritten |
| An HTTP export/bulk-update endpoint | Explicitly rejected in the PRD (Q1, 2026-09-10): no enrichment HTTP surface |

**Running inside the container is the only option where the script and the app
share a lock table.** `key_lock` is a process-local registry; two processes do not
contend. Since `docker compose` runs a single app container, "inside the
container" means "inside the same process space as the app's workers", and the
lock is real.

### Consequences and limits

- **This is the constraint that makes AC 5 of Story 4.2 satisfiable at all** — "it
  takes the same lock the app takes" is only true in-process.
- **The app image must contain the script.** `backend/scripts/` is already copied
  into the image, so no Dockerfile change is needed.
- **Scaling to more than one app container would break this**, and would break the
  app's own locking first. Recorded as a known limit of the whole persistence
  design, not of enrichment.
- The script imports the app's repository layer directly, which is why it lives
  under `backend/` and runs with `backend/` as its working directory.
