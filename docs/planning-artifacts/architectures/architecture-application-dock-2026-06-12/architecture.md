---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-06-15'
inputDocuments:
  - docs/planning-artifacts/prds/prd-application-dock-2026-06-10/prd.md
  - docs/planning-artifacts/ux-designs/ux-application-dock-2026-06-10/DESIGN.md
  - docs/planning-artifacts/ux-designs/ux-application-dock-2026-06-10/EXPERIENCE.md
  - docs/planning-artifacts/briefs/brief-application-dock-2026-06-10/brief.md
  - docs/architecture/tech-stack.md
  - docs/architecture/source-tree.md
  - docs/architecture/coding-standards.md
  - docs/planning-artifacts/architecture.md
  - CLAUDE.md
workflowType: 'architecture'
project_name: 'Hotaru (Japanese Vocabulary) — app within Application Dock'
user_name: 'Your Highness'
date: '2026-06-12'
---

# Architecture Decision Document — Hotaru

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together. Scope: the **Hotaru** vocabulary app as a new self-contained app inside the existing Application Dock platform; platform-wide architecture is already decided in `docs/planning-artifacts/architecture.md` and is inherited, not re-litigated._

## Project Context Analysis

### Requirements Overview

**Functional Requirements (24 FRs across 5 features):**
- **F1 Identity (FR-1,2):** app registered in the shell; 2 hardcoded users; all progress, private words, and private notes scoped to the active user; no auth.
- **F2 Library & Org (FR-3–9):** one shared master vocabulary list; Word records; Lesson (textbook+chapter) + Topic (shared, many-to-many) grouping; shared/private word flag; low-friction manual entry; Genki seeding from a pre-assembled dataset. → the core data model + repository layer.
- **F3 Practice Session (FR-10–18):** picker → scope → pre-session overview → Anki drill; direction toggle (JP→EN / EN→JP); scoring mode (self-grade 3-level / typed exact-match kana, EN→JP only, non-match → self-grade); session summary; calm bounds (no due-debt). → mostly a frontend state machine + grade persistence.
- **F4 SRS & Familiarity (FR-19–21):** automatic invisible scheduling within scope; per-user, per-word familiarity (5 tiers); grades move familiarity. → a backend scheduling/familiarity service.
- **F5 Notes (FR-22–24):** free-form per-word notes, multiple per word, authored, shared (implicit) or private (🔒), visible during drill. → data model + privacy isolation.

**Non-Functional / Constraints:**
- Platform-fixed stack: FastAPI (Python 3.12) + Vue 3/Quasar v2/Pinia/TS; **JSON files on disk, no DB**; atomic writes via repo layer; `useApi` single HTTP boundary; self-contained app module + registry + lazy routes.
- **Mobile-only** phone web (single-column, full-bleed).
- **Privacy isolation** between the two users (private words/notes) — the one hard data rule.
- **Architect-for-AI** now, ship without it (Phase II).
- Calm guardrail (no streaks/due-counts) — a UX constraint with API implications.

**Scale & Complexity:**
- Primary domain: full-stack web (mobile SPA + REST API).
- Complexity level: **Low–medium** (small scale; complexity concentrated in the data model + SRS).
- **Scale ceiling: ≤5,000 vocabulary records (realistically ~1,000; max 2,000–3,000).** Small enough that the master list is a single in-memory file — no scale-based sharding.
- Estimated architectural components: ~7 (hotaru router, vocab/notes service, SRS-familiarity service, vocab/progress/notes repositories, schemas, seed-loader, frontend `apps/hotaru/` module).

### Technical Constraints & Dependencies
- Inherits all platform conventions (`docs/architecture/` + the platform `architecture.md`); no new top-level dirs; no DB; no auth; no external runtime services in v1 (AI is Phase II).
- **Seed dataset is produced by an offline pipeline outside the app** as **step one of the build**. Known source format — a flat array of `{hiragana, kanji (may be ""), romaji, type, english, lesson, edition}` with **no `id` field**.
- **Stable word IDs are minted once, up front, at dataset-prep time** (build step one) and trusted thereafter — no runtime re-seed ID-stability machinery (no ledger/fingerprinting). Derive the id from immutable identifying fields, never from editable `english`/`romaji`.
- Two-user concurrent writes are confined to genuinely shared files only; per-user state is partitioned by file.

### Cross-Cutting Concerns Identified
- **File layout (decided direction):** one **read-only `vocab.json`** (seed-only at runtime) + **per-user `progress.json`** (and `notes.json` if private notes exist), namespaced under a `hotaru/` subfolder of `DATA_DIR`. Split by *ownership/privacy*, not scale.
- **Per-user privacy isolation** enforced as a **path boundary** (`hotaru/users/{id}/…`), not a service-layer filter.
- **Deterministic SRS/familiarity** as a **pure service** (`next_review(state, grade, now)` with injected `now`); "due" derived at query time, never persisted; the **drill-queue API returns a queue, not a debt** (no due-counts/overdue exposed) — the calm guardrail as a contract.
- **Completeness tagging** (`drill_caps`) computed at seed so the drill never serves a card the data can't fulfill (e.g. empty-kanji words simply lack the kanji-drill mode; reading+meaning floor guarantees every word is drillable).
- **Drill feel:** batch-fetch the session queue + optimistic local grading + background sync (the card flip must feel instant on a phone).
- **User-switch = hard session boundary** (flush/attribute pending grades by owner; in-progress queue is per-user).
- **Shared notes: last-write-wins, no concurrency handling** — deliberately simple (low-effort app; note timing unimportant).
- **AI-readiness reframed:** v1 ships **no AI fields**; readiness = stable word IDs + open-shaped JSON objects (add fields the day the Phase II "✨ improve" action ships).
- **Platform-pattern reuse:** 3-layer backend (repo-only file I/O, shared atomic-write helper, thin per-aggregate repos), registry + lazy routes, Pinia stores with loading/error, `useApi`.

## Starter Template Evaluation

### Primary Technology Domain
Full-stack web (mobile-first SPA + REST API) — delivered as a new app module inside an existing, already-scaffolded monorepo, not a new standalone project.

### Starter Options Considered
**None applicable.** The platform scaffold already exists (Quasar CLI frontend + FastAPI backend, multi-stage Docker build, single-container serve). Any external starter would conflict with established conventions. Decision: **no starter — extend the existing repository** following `docs/architecture/` and the platform `architecture.md`. Versions are pinned by the existing project (`tech-stack.md`): Python 3.12 / FastAPI / Pydantic v2; Vue 3 / Quasar v2 / Vite / Pinia / TS.

### Selected "Starter": Existing Application Dock scaffold (inherited)
**Rationale:** Adding an app is a lightweight extension (registry + lazy routes + backend router + app module); the repo already encodes language, build tooling, test runners, lint/format, routing, state, and the HTTP boundary. Re-scaffolding would discard all of it.

**Inherited decisions (not re-decided):**
- Language/runtime: Python 3.12 (FastAPI/Uvicorn/Pydantic v2); TypeScript (strict) Vue 3.
- Build: Vite via Quasar CLI; multi-stage Dockerfile (node build → python serve).
- Testing: pytest (+ httpx); Vitest (+ @vue/test-utils), co-located `*.spec.ts`.
- Lint/format: black + ruff; ESLint + Prettier.
- Organization: 3-layer backend; self-contained `src/apps/<app>/`; app registry + lazy routes; `useApi` boundary; Pinia stores.
- Persistence: JSON-on-disk via repository layer (atomic writes).

**Note — the "first implementation story" is NOT project init** (already done). It is: **(1) the offline word-list/seed-dataset preparation** (assign stable word IDs, compute `drill_caps`), then **(2) registering the Hotaru app** (registry + routes + backend router + `apps/hotaru/` skeleton + `docs/stories/hotaru/` folders).

## Core Architectural Decisions

### Decision Priority Analysis

**Critical (block implementation):** data file layout & Word schema; word ID scheme; SRS/familiarity model; user-scoping mechanism; drill-queue API contract.
**Important (shape the architecture):** repository decomposition; frontend module structure + drill state machine; notes privacy enforcement.
**Deferred (post-MVP):** all AI behaviour & fields (Phase II); listening mode, grammar/kanji, delight extras (Phase III). Inherited and unchanged: stack, build, Docker, no-auth, mobile-only.

### Data Architecture

**File layout — under `DATA_DIR/hotaru/`, split by ownership/privacy (not scale):**
- `vocab_seed.json` — **read-only** seed produced by the offline pipeline (all shared).
- `vocab_shared.json` — user-added **shared** words (last-write-wins).
- `users/{user}/words_private.json` — user-added **private** words (visible only to owner).
- `users/{user}/progress.json` — per-user SRS state `{word_id: {tier, points, last_reviewed_at}}`.
- `notes_shared.json` — shared notes; `users/{user}/notes_private.json` — private notes. LWW, no concurrency handling (deliberately simple).
- `topics.json` — shared topics `{id, name, word_ids[]}`.
- **Lessons** derived from each word's `lesson` + `edition` (no file).
- The **master vocabulary list** at read-time = `vocab_seed` + `vocab_shared` + the active user's `words_private`. Repos `mkdir(parents=True, exist_ok=True)` (nested dirs — a path the archery sibling never exercised).

**Word schema (Pydantic):** `{id, source, reading, kanji|None, romaji, meaning, pos, lesson, visibility, drill_caps[]}`. **Every** word carries `visibility` (`shared|private`) for a consistent total shape; seeded words are always `shared`. `""` kanji from source → `None` on ingest.

**`source` field (revision, 2026-07-06 — supersedes `edition`/`owner`):** every word carries `source` identifying origin — a textbook slug for seeded words (`genki_3`, derived `f"genki_{edition}"` at seed time) or a user id for user-added words (`dani`/`jake` — the two canonical user ids). `source` **replaces** the standalone `edition` field (its info is folded into the slug) **and** the separate `owner` field (for user words, `source` *is* the owner). No separate "seeded vs user-added" boolean — origin is derivable from `source` (and from storage location). Word ID embeds it: seeded `"{source}-{lesson}-{seq}"` (e.g. `genki_3-G-0007`); user-added `"{source}-{uuid8}"` (e.g. `dani-a1b2c3d4`).

**`drill_caps`** computed at seed time: `r2m` + `m2r` floor (reading+meaning always present → every word drillable); add `k2r` iff `kanji is not None`. The practice service *consumes* caps, never derives them.

**Word IDs** — assigned once at dataset-prep (build step one), trusted thereafter; derived from immutable fields only. Scheme: positional **`"{edition}-{lesson}-{seq}"`** (e.g. `3-G-0007`); user-added words get **`"u-{uuid8}"`**. Seed script fails loudly on a duplicate id.

**Validation:** Pydantic v2 models in `schemas/`; a top-level `schema_version` in the seed file with a `migrate(raw) → current` hook in the vocab read path (no DB to ALTER).

### Authentication & Security
- **No auth** (inherited, LAN/household, 2 hardcoded users).
- **User scoping:** a validated **`user` query param** on user-scoped endpoints (rejected if not one of the 2 hardcoded users).
- **Privacy = path boundary:** private words/notes live under `users/{user}/…`; the repo takes `user` and physically cannot return another user's file. Never a service-layer filter. Every read path that returns notes/words must respect this (lists & future search included).

### API & Communication Patterns
Direct serialization, snake_case JSON, `{detail}` errors, ISO-8601 dates (platform contract). Routes under `/api/hotaru`:
- `GET /words?lesson=&topic=&user=` · `POST /words` (manual add) · `GET /topics` · `POST /topics` · `PATCH /words/{id}/topics`
- `GET /practice/overview?scope=&user=` → word count + familiarity distribution
- `GET /practice/queue?scope=&direction=&mode=&user=` → **ordered queue, NO due-counts/overdue** (the calm contract — debt never enters the response schema)
- `POST /practice/grades?user=` → **batch** grade submission (enables optimistic local grading + background sync)
- `GET /words/{id}/notes?user=` · `POST /words/{id}/notes?user=` · `PATCH /notes/{id}?user=` (visibility)

### Frontend Architecture (`src/apps/hotaru/`)
Self-contained module (shell imports only `registry.ts`):
- `pages/`: Identity ("Who's studying?"), Home, Picker, Drill, Summary, Library, AddWord, WordDetail.
- `components/`: Flashcard, GradeButtons, FamiliarityIcon, FireflyLayer, WordRow, CategoryPills, NoteList, AddNote, AvatarSwitcher.
- `stores/` (Pinia, each exposes `loading`/`error`): `useHotaruUserStore`, `useHotaruLibraryStore`, `useHotaruPracticeStore`.
- `composables/`: `useDrill` (the prompt→reveal→grade state machine).
- `types.ts`.
- **Drill feel:** batch-fetch the session queue once, grade **optimistically in local store**, sync grades to `POST /practice/grades` in the background.
- **User switch = hard session boundary:** flush pending grades (attributed to the previous user) then **discard the in-progress queue**; the next user starts fresh.

### SRS & Familiarity (the one non-trivial algorithm)
A **pure, deterministic** service `srs.next_review(state, grade, now)` with **injected `now`** (no internal clock — table-testable). State per (user, word) = `{tier, points, last_reviewed_at}`.

- **5 tiers / review intervals:** New `same-session` · Learning `1d` · Familiar `3d` · Strong `7d` · Mastered `21d`.
- **Exponential advancement cost (points to leave a tier):** `[1, 3, 9, 18]` (New→Learning→Familiar→Strong→Mastered). Single tunable array.
- **Grade → points:** **Correct** +1 (on reaching threshold → +1 tier, points reset to 0); **Close** holds tier, +0; **Incorrect** drops one tier (floor New), points reset to 0.
- **Due** is derived (`last_reviewed_at + interval[tier]`), never persisted, never surfaced as a count.
- Familiarity tier drives the UX colour/icon (5-tier ramp).

### Infrastructure & Deployment
Inherited unchanged — same single container & multi-stage build; data under `DATA_DIR/hotaru/`; no new services in v1 (AI is Phase II).

### Decision Impact Analysis

**Implementation sequence:**
1. Offline seed-dataset prep (assign IDs, compute `drill_caps`, `schema_version`).
2. Register the app (registry + routes + backend router + `apps/hotaru/` skeleton + `docs/stories/hotaru/`).
3. Backend: schemas → `_storage` + per-aggregate repos → `srs.py` (pure) → services → router.
4. Frontend: stores + `useApi` calls → Library/AddWord → Picker → Drill (state machine) → Notes → Summary.

**Cross-component dependencies:** stable word IDs underpin progress, notes, and topic references; the queue-not-debt contract constrains both the practice service and every client store; path-as-privacy-boundary constrains repos *and* every notes/words read path; `drill_caps` (set at seed) gates which directions/modes the picker and queue may offer.

## Implementation Patterns & Consistency Rules

_General naming/format/error/loading/test conventions are inherited from `docs/architecture/coding-standards.md` and `source-tree.md` and are NOT restated here. Below are the Hotaru-specific rules where AI agents could otherwise diverge._

### Data file & path conventions (canonical — do not invent alternatives)
- Exact paths under `DATA_DIR/hotaru/`: `vocab_seed.json`, `vocab_shared.json`, `topics.json`, `notes_shared.json`, `users/{user}/words_private.json`, `users/{user}/progress.json`, `users/{user}/notes_private.json`.
- Every repo write does `path.parent.mkdir(parents=True, exist_ok=True)` before the atomic write (nested dirs the archery sibling never used).
- **Word ID format:** seed → `"{source}-{lesson}-{seq}"` (e.g. `genki_3-G-0007`, `seq` zero-padded width 4, `source = f"genki_{edition}"`); user-added → `"{source}-{uuid8}"` (e.g. `dani-a1b2c3d4`). Never an array index; IDs are immutable. **Canonical user ids: `dani`, `jake`.**

### Repository decomposition
- One `repositories/_storage.py` with shared `_atomic_write_json(path, payload)` + `_read_json(path)`. Do NOT copy the atomic-write helper into each repo.
- Thin per-aggregate repos: `vocab_repo.py`, `progress_repo.py`, `notes_repo.py`, `topic_repo.py`. Repos are the ONLY filesystem code; they raise stdlib errors, never `HTTPException`.
- **Privacy is a path, not a filter:** any repo touching private data takes `user` and resolves `users/{user}/…`; it cannot return another user's file. No service-layer owner filtering.

### SRS service purity
- `services/srs.py` exposes a pure `next_review(state, grade, now) -> state` plus interval/label helpers. **`now` is always injected** — no `datetime.now()` inside. The service consumes `drill_caps`, never derives them. Table-tested at every tier/point boundary.

### API contract specifics
- All routes under `/api/hotaru/...`, kebab-case plural.
- **Queue-not-debt:** `practice/queue` and `practice/overview` response models MUST NOT contain due-counts, overdue, or `next_review_at` — the Pydantic response models physically omit them.
- **User scoping:** user-scoped endpoints take a `user` query param; the router validates it against the 2 hardcoded users (`404`/`422` if unknown); private files resolved from that value.
- Grades submitted as a **batch** array to `POST /practice/grades`; each item `{word_id, grade}`, `grade ∈ {correct, close, incorrect}`.

### Schema & ingest rules
- Pydantic v2 models in `schemas/`. `kanji == "" → None` on ingest. String enums: `DrillCap = {r2m, m2r, k2r}`, `Grade = {correct, close, incorrect}`.
- Familiarity stored as `tier: int (0–4)` + `points: int`; the tier→colour/icon mapping is a frontend concern (DESIGN.md), not server-side.
- Seed file carries top-level `schema_version`; `vocab_repo` read path runs `migrate(raw) → current`.

### Frontend module rules (`src/apps/hotaru/`)
- Self-contained; the shell imports only `apps/registry.ts`. Hotaru components live under `apps/hotaru/components/`, never in shared `src/components/`.
- All HTTP via `useApi`; every Pinia store exposes `loading`/`error`, set in `try/finally`.
- **Optimistic grading:** `useDrill` mutates familiarity locally on grade and queues a background sync; the UI never blocks on the grade round-trip.
- **User switch** flushes pending grades (tagged with the prior user) then discards the in-progress queue; never replays one user's grades after a switch.

### Enforcement
All agents MUST: use the canonical file paths & ID format; route private access through `users/{user}/` repos; keep `srs.py` pure with injected `now`; keep debt out of response schemas. Verified by: a repo path-boundary test (user A cannot fetch user B's private file), `srs` boundary tables, and a seed-completeness test (`len(drill_caps) ≥ 2`; `k2r ⇔ kanji is not None`).

## Project Structure & Boundaries

> **Seed-location refinement (supersedes the step-4 note):** the read-only `vocab_seed.json` is **committed in the repo and shipped in the image** (version-controlled, read-only at runtime), at `backend/app/hotaru_seed/vocab_seed.json`. Only *writable* state lives under `DATA_DIR/hotaru/`. This makes "read-only at runtime" literal and survives data-volume resets.

### Backend additions (`backend/`)
```
app/
├── routers/hotaru.py                  ← all /api/hotaru/* routes (FR-1..24 HTTP surface)
├── services/
│   ├── hotaru_vocab_service.py        ← master-list assembly, library, topics, manual add (F2)
│   ├── hotaru_practice_service.py     ← scope→queue, overview, grade application (F3, F4)
│   ├── hotaru_notes_service.py        ← notes add/visibility (F5)
│   └── srs.py                         ← PURE next_review(state, grade, now) (F4)
├── repositories/
│   ├── _storage.py                    ← shared _atomic_write_json / _read_json (new; hotaru repos use it)
│   ├── vocab_repo.py                  ← reads shipped seed + vocab_shared + users/{u}/words_private
│   ├── progress_repo.py               ← users/{u}/progress.json
│   ├── notes_repo.py                  ← notes_shared + users/{u}/notes_private
│   └── topic_repo.py                  ← topics.json
├── schemas/hotaru.py                  ← Word, Topic, Note, ProgressEntry, GradeItem, QueueItem, enums
└── hotaru_seed/vocab_seed.json        ← shipped read-only seed (committed; carries schema_version)

scripts/build_hotaru_seed.py          ← OFFLINE build-step-one tool: raw list → vocab_seed.json
scripts/genki_raw.json                ← raw source vocab (input to the build tool)

tests/
├── test_srs.py                        ← tier/point boundary tables (pure)
├── test_hotaru_vocab_repo.py          ← incl. path-boundary privacy test
├── test_hotaru_practice.py            ← queue building + queue-not-debt contract
├── test_hotaru_notes.py               ← shared vs private visibility
├── test_hotaru_router.py              ← API contract, user-param validation
└── test_hotaru_seed.py                ← drill_caps completeness (len≥2; k2r ⇔ kanji)
```

### Writable data (`DATA_DIR/hotaru/` — created on first write)
```
hotaru/
├── vocab_shared.json
├── topics.json
├── notes_shared.json
└── users/{dani,jake}/{progress.json, words_private.json, notes_private.json}
```
(seed is NOT here — it ships in the image, read-only.)

### Frontend additions (`frontend/src/apps/hotaru/`)
```
hotaru/
├── pages/      IdentityPage, HotaruHomePage, PracticeSetupPage, DrillPage,
│               SessionSummaryPage, LibraryPage, AddWordPage, WordDetailPage
├── components/ Flashcard, GradeButtons, FamiliarityIcon, FireflyLayer, WordRow,
│               CategoryPills, NoteList, AddNote, AvatarSwitcher  (+ co-located *.spec.ts)
├── composables/ useDrill.ts            ← prompt→reveal→grade machine + optimistic sync
├── stores/     useHotaruUserStore, useHotaruLibraryStore, useHotaruPracticeStore
└── types.ts
```
Plus: entry in `src/apps/registry.ts`; lazy routes in `src/router/`; forest/firefly tokens in `src/css/quasar.variables.sass` + `app.sass` (from DESIGN.md). Stories: `docs/stories/hotaru/` with `for-review/` + `done/`.

### Architectural Boundaries
- **API:** `/api/hotaru/*` only (router → services → repos). Routers translate stdlib errors → `HTTPException` and validate the `user` param.
- **Data:** repos are the only filesystem code; `_storage.py` owns atomic writes; private access flows through `users/{user}/` paths (structural privacy); seed read from the shipped package path, never written.
- **Frontend:** `apps/hotaru/` self-contained; shell imports only `registry.ts`; all HTTP via `useApi`; stores own `loading`/`error`; `useDrill` owns optimistic grade state + background sync.
- **Offline boundary:** `scripts/build_hotaru_seed.py` runs outside the served app (build step one); its only output is the committed `vocab_seed.json`.

### Requirements → Structure mapping
| Feature | Backend | Frontend |
|---|---|---|
| F1 Identity | `routers/hotaru.py` (user validation) | `IdentityPage`, `AvatarSwitcher`, `useHotaruUserStore` |
| F2 Library/Org | `hotaru_vocab_service`, `vocab_repo`, `topic_repo` | `LibraryPage`, `AddWordPage`, `WordRow`, `CategoryPills`, `useHotaruLibraryStore` |
| F3 Practice | `hotaru_practice_service` | `PracticeSetupPage`, `DrillPage`, `SessionSummaryPage`, `Flashcard`, `GradeButtons`, `useDrill`, `useHotaruPracticeStore` |
| F4 SRS/Familiarity | `srs.py`, `progress_repo` | `FamiliarityIcon` |
| F5 Notes | `hotaru_notes_service`, `notes_repo` | `WordDetailPage`, `NoteList`, `AddNote` |
| Seed (step one) | `scripts/build_hotaru_seed.py` → `hotaru_seed/vocab_seed.json` | — |

### Data Flow
Drill: `PracticeSetupPage` → `GET /practice/queue` (service builds from `srs` due-state, filtered by `drill_caps`, soft-capped to a calm session size — **default 20, tunable** — with the word's shared + active-user private notes attached, privacy-filtered server-side) → `DrillPage` grades locally (optimistic) → batched `POST /practice/grades` → `practice_service` applies `srs.next_review` → `progress_repo` writes the per-user file. No due-debt ever leaves the API.

## Architecture Validation Results

### Coherence Validation ✅
- **Decision compatibility:** all choices inherit the fixed platform stack; no version conflicts. Read-only seed + per-user writable files, the pure SRS service, and the queue-not-debt API are mutually consistent.
- **Pattern consistency:** Hotaru-specific rules extend (don't contradict) `coding-standards.md`/`source-tree.md`; path-as-privacy-boundary aligns with repo-only I/O.
- **Structure alignment:** the file tree realizes every decision; API/data/frontend/offline boundaries are explicit.

### Requirements Coverage Validation ✅
- **F1 (FR-1,2):** registry/routes/router + IdentityPage + validated `user` param.
- **F2 (FR-3–9):** `vocab_repo` master-list assembly, `topic_repo`, `vocab_shared`/`words_private` (shared/private), `POST /words`, `build_hotaru_seed.py` + shipped seed.
- **F3 (FR-10–18):** PracticeSetup/Drill/Summary; `practice/overview`, `practice/queue` (direction+mode+scope, soft-capped), batch grades, optimistic `useDrill`; typed exact-match compared client-side → grade.
- **F4 (FR-19–21):** `srs.py` (5 tiers, exponential points, intervals) + `progress_repo`; FamiliarityIcon.
- **F5 (FR-22–24):** `notes_repo`/`notes_service`, `POST`/`PATCH` notes, privacy-filtered notes in word/queue payloads (visible mid-drill).
- **NFRs:** mobile-only (FE); privacy = path boundary; no auth; JSON + atomic writes; calm = queue-not-debt; architect-for-AI = stable IDs + open JSON (no v1 AI fields).

### Implementation Readiness Validation ✅
Decisions documented (stack inherited+pinned; data model; ID scheme; SRS model; API contract). Patterns cover the divergence points (paths, IDs, repo decomposition, SRS purity, queue-not-debt, privacy, FE rules). Structure is a concrete, complete tree with FR mapping. Enforcement tests specified.

### Gap Analysis
- **Critical:** none.
- **Important:** none open. Two minor gaps found during validation were resolved inline: (1) session size → soft cap default 20, tunable; (2) notes reach the drill via privacy-filtered inclusion in word/queue payloads.
- **Nice-to-have (future):** tune SRS array `[1,3,9,18]` + session cap from lived use; pick a Japanese display font; finalize familiarity icon glyphs (DESIGN.md TBDs); decide re-seed policy if Genki data is regenerated (IDs stable → additive is safe).

### Architecture Completeness Checklist
**Requirements Analysis:** [x] context · [x] scale/complexity · [x] constraints · [x] cross-cutting concerns
**Architectural Decisions:** [x] critical decisions w/ versions (inherited+pinned) · [x] stack specified · [x] integration patterns · [x] performance (batch fetch + in-memory at ≤5k)
**Implementation Patterns:** [x] naming · [x] structure · [x] communication · [x] process (errors/loading/privacy)
**Project Structure:** [x] complete tree · [x] boundaries · [x] integration points · [x] requirements→structure mapping

### Architecture Readiness Assessment
**Overall Status:** **READY FOR IMPLEMENTATION** (all 16 items ✅, no critical gaps).
**Confidence:** High — small surface, fixed platform rails, decisions pressure-tested via the roundtable.
**Key strengths:** structural privacy; deliberately-simple-but-extensible data model; pure testable SRS; calm enforced as a contract; minimal real AI-readiness.
**Areas for future enhancement:** Phase II AI seam; SRS/session tuning; font + icon finalization.

### Implementation Handoff
- Follow the decisions/patterns/structure exactly; refer here for architectural questions.
- **First implementation priority:** (1) `scripts/build_hotaru_seed.py` → committed `vocab_seed.json` (assign IDs, compute `drill_caps`); (2) register the app (registry + routes + router + `apps/hotaru/` skeleton + `docs/stories/hotaru/`).
