---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - CLAUDE.md
  - docs/planning-artifacts/epics-kdh.md
  - docs/planning-artifacts/epics-listies.md
  - docs/stories/kdh/for-review/1.2.shared-data-model-and-repository.story.md
  - docs/stories/application-dock-general/1.8 (concurrency-safe JSON persistence — platform locks)
  - Product decisions captured interactively 2026-09-05 (shared social feed, curated question set,
    free-text + scale answers, answer history, edit-until-end-of-day, answer-to-reveal)
---

# Question of the Day — Epic Breakdown

## Overview

This document is the complete epic and story breakdown for **Question of the Day** (QotD), a shared
daily-prompt app shipped as a new self-contained app inside the Application Dock platform.

Every calendar day surfaces **one** question, drawn from a **built-in curated set** and chosen
**deterministically from the date** (server-side) so every logged-in dock user sees the same
question on the same day. A question is one of two types — **free-text** or **scale/rating** — and
the app renders the input to match. Each user writes **one answer per day**; today's answers stay
hidden until **you have answered yourself**, then the day's feed unlocks and you can read everyone
else's response, each attributed to its author (**answer-to-reveal**). You can **edit your own
answer while it is still today**; once the day rolls over (decided by the server clock, never the
browser's) the day locks and becomes read-only. A **history** view lets anyone browse past days and
read the whole group's answers.

Platform-wide architecture is **inherited, not re-built**: the 3-layer backend
(router → service → repo), the `useApi` HTTP boundary, the app registry + lazy routes, JWT auth via
`get_current_user`, atomic JSON-file persistence, and the platform's per-key write lock. Like KDH,
QotD's data is **shared, not per-user** — the store file is keyed by **date**, and the JWT username
only decides *whose* answer within a day, never *which file*. Stories live under
`docs/stories/question-of-the-day/`.

## Requirements Inventory

### Functional Requirements

**F1 — App integration & identity**

- **FR-1:** QotD is registered in the Application Dock shell (a card on the landing page + its own
  route), with a backend router mounted under `/api/qotd`; every route sits behind
  `Depends(get_current_user)`.
- **FR-2:** Answers are **attributed to the logged-in user** via the JWT username
  (`get_current_user`). No `user`/`username` field is accepted in any request path or body — it is
  always derived from the token. Every dock user shares the same daily question and the same pool of
  answers (the app is shared, not per-user).

**F2 — The daily question**

- **FR-3:** A **built-in curated set** of questions ships with the app. Each question has a **type**
  — `text` (free-text response) or `scale` (a rating within a min/max range, with optional end
  labels). There is **no authoring UI** in v1.
- **FR-4:** Exactly **one question is surfaced per calendar day**, chosen **deterministically from
  the date** server-side, so every user sees the same question on a given day and the choice is
  reproducible across restarts and processes.
- **FR-5:** Opening the app shows **today's question** and today's date, rendered with the input
  appropriate to the question's type.

**F3 — Answering**

- **FR-6:** A user can submit an answer to today's **free-text** question (a written response).
- **FR-7:** A user can submit an answer to today's **scale** question (a value within the
  question's declared range).
- **FR-8:** A user can **edit / replace their own answer while it is still today**. There is exactly
  **one answer per user per day** — a re-submit upserts, it never appends.
- **FR-9:** Once a day has passed, its answers are **read-only** — no user can add or change an
  answer for a past day. The today-vs-past boundary is decided **server-side**, never from the
  client clock.

**F4 — Seeing answers & history**

- **FR-10:** For today, a user sees **everyone's answers only after they have answered themselves**
  (answer-to-reveal); before answering, other people's responses are withheld. Once revealed, each
  answer is attributed to its author.
- **FR-11:** A user can browse a **history** of past days — a reverse-chronological list of previous
  questions (with the day's date).
- **FR-12:** Selecting a past day shows that day's **question and the whole group's answers**,
  read-only and always visible (past days are not gated behind answer-to-reveal).

### NonFunctional Requirements

- **NFR-1 — Concurrency-safe shared writes:** many users may answer the same day at once. Every
  read-modify-write on a day's file is serialized with the platform's per-key lock
  (`core.locks.key_lock`), keyed by the day file, so no answer silently overwrites another. Writes
  to **different** days are not serialized against each other.
- **NFR-2 — No path traversal:** the date that selects a day file arrives from the URL and is
  therefore untrusted; a value that is not a canonical `YYYY-MM-DD` is rejected before it touches
  the filesystem.
- **NFR-3 — JSON files on disk, atomic writes, no database:** all writes go through the platform's
  `core.storage.atomic_write_json` (write-`.tmp`-then-`os.replace`); the repository is the only
  module that touches the filesystem.
- **NFR-4 — Platform conformance:** strict 3-layer backend (stdlib exceptions become
  `HTTPException` **only** in routers); `useApi` is the single HTTP boundary; registry + lazy routes;
  the Pinia store exposes `loading` / `error`; snake_case JSON, **direct serialization** (no
  `{data,status}` envelopes), `{detail}` errors, ISO-8601 timestamps; all routes behind
  `Depends(get_current_user)`.
- **NFR-5 — The clock is the server's:** "today" and the past/future boundary are resolved by a
  single server-side helper that every past-vs-present decision shares; the client clock is never
  trusted for gating writes.

### Additional (Architecture) Requirements

- **AR-1 — App registration:** registry entry (`frontend/src/apps/registry.ts`) + lazy routes
  (`frontend/src/router/routes.ts`) + `_APPS` entry in `backend/app/routers/shell.py` + backend
  `routers/qotd.py` mounted under `/api/qotd` + `frontend/src/apps/question-of-the-day/` skeleton +
  `docs/stories/question-of-the-day/{for-review,done}/`.
- **AR-2 — Data layout:** one shared JSON file per day at `DATA_DIR/qotd/days/{YYYY-MM-DD}.json`;
  the repo `mkdir(parents=True, exist_ok=True)` on write and returns a fresh empty day document when
  a date has no file yet. Days are listed by **scanning the directory** — no index file (which would
  become a second contention point, cf. KDH / archery).
- **AR-3 — Curated question set as a bundled asset:** the questions ship as a static asset
  (`backend/app/data/qotd_questions.json`), loaded once. Each entry:
  `{ id, text, type: "text" | "scale", scale?: { min, max, min_label?, max_label? } }`. The set is
  the source of truth; a day file stores only the resolved `question_id`, never a copy of the text.
- **AR-4 — Deterministic daily selection:** a single service helper maps a calendar date → a
  question id, pure and reproducible (e.g. an ordinal-of-date modulo the set length). Given the same
  date and the same set it always returns the same question, in any process.
- **AR-5 — Repository / service / schemas split:** `repositories/qotd_repo.py` (only FS access,
  atomic writes, per-day transaction context manager), `services/qotd_service.py`
  (question resolution, answer upsert, reveal/lock rules; raises stdlib exceptions only),
  `schemas/qotd.py` (Pydantic v2 models). Top-level `schema_version` with a `migrate()` on read.
- **AR-6 — API contract:** `/api/qotd/*`, every route `Depends(get_current_user)`; the username
  attributes the answer and never appears in a path/body. Direct serialization; `{detail}` errors;
  ISO-8601 timestamps; snake_case fields.

### Data Model

One shared JSON file per day — `DATA_DIR/qotd/days/{YYYY-MM-DD}.json`:

```jsonc
{
  "schema_version": 1,
  "date": "2026-09-05",           // matches the filename; the day's identity (AR-2)
  "question_id": "q-0042",        // resolved once from the date via the curated set (FR-4, AR-4)
  "answers": {                    // keyed by JWT username (FR-2) — one answer per user per day
    "alice": {
      "text": "That summer in Lisbon.",   // set for a `text` question; null for a `scale` one
      "rating": null,                       // set for a `scale` question; null for a `text` one
      "created_at": "2026-09-05T08:12:00Z",
      "updated_at": "2026-09-05T08:12:00Z"
    },
    "bob": {
      "text": null,
      "rating": 4,
      "created_at": "2026-09-05T09:01:00Z",
      "updated_at": "2026-09-05T09:40:00Z"  // bumped on edit (FR-8)
    }
  }
}
```

The curated set — bundled, read-only (`backend/app/data/qotd_questions.json`):

```jsonc
[
  { "id": "q-0001", "text": "What's a small thing that made you smile today?", "type": "text" },
  {
    "id": "q-0042", "text": "How rested do you feel right now?", "type": "scale",
    "scale": { "min": 1, "max": 5, "min_label": "Running on empty", "max_label": "Fully charged" }
  }
]
```

### FR Coverage Map

- **FR-1:** Epic 1 — Story 1.1 (shell card, routes, `/api/qotd` router, docs scaffolding).
- **FR-2:** Epic 1 — Stories 1.3, 1.4 (JWT attribution; shared, date-keyed store).
- **FR-3:** Epic 1 — Story 1.2 (curated set, typed questions).
- **FR-4:** Epic 1 — Story 1.2 (deterministic daily selection).
- **FR-5:** Epic 1 — Story 1.4 (today's question renders by type).
- **FR-6:** Epic 2 — Stories 2.1, 2.2 (text answer: endpoint + UI).
- **FR-7:** Epic 2 — Stories 2.1, 2.2 (scale answer: endpoint + UI).
- **FR-8:** Epic 2 — Stories 2.1, 2.3 (upsert; edit while today).
- **FR-9:** Epic 2 — Story 2.3 (past-day lock, server-side boundary).
- **FR-10:** Epic 3 — Story 3.1 (answer-to-reveal today's feed).
- **FR-11:** Epic 3 — Story 3.2 (history list of past days).
- **FR-12:** Epic 3 — Story 3.3 (read a past day, always visible).

## Epic List

### Epic 1: Foundations — open the app and see today's question

Get QotD into the dock and put today's question on screen for a logged-in user. Delivers the app
registration, the curated question set with reproducible daily selection, the shared date-keyed data
layer with concurrency-safe writes, and a home page that shows today's question rendered by type.
After this epic a user can open the app and read the day's prompt — answering arrives in Epic 2.
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5.

### Epic 2: Answer the question

Let a user participate: submit an answer to today's question (free-text or scale, as the question
dictates), see their own saved answer, edit it while it is still today, and be prevented — by the
server — from touching a day that has passed. **FRs covered:** FR-6, FR-7, FR-8, FR-9.

### Epic 3: See everyone's answers & browse history

Deliver the social payoff and the archive: once you have answered today, the day's feed unlocks and
you can read everyone's response; and any user can browse the reverse-chronological history of past
days and open one to read the whole group's answers, read-only. **FRs covered:** FR-10, FR-11,
FR-12.

---

## Epic 1: Foundations — open the app and see today's question

Get QotD into the dock and put today's question on screen. This epic stands alone (a user can open
the app and read the day's prompt) and lays the registration, question-selection, and shared
data layer that Epics 2 and 3 build on.

### Story 1.1: Register Question of the Day in the shell

As a user,
I want Question of the Day to appear as an app in the dock and open to its own home,
so that I can launch it like any other app in the platform.

**Acceptance Criteria:**

**Given** the dock landing page,
**When** it renders the app registry,
**Then** a Question of the Day card appears (label "Question of the Day", a thematic Material icon)
alongside the existing apps, and selecting it routes to `/question-of-the-day`. (FR-1)

**Given** `GET /api/apps`,
**When** it is called,
**Then** the response includes a QotD `AppDescriptor`
(`id: "question-of-the-day"`, matching label, icon, `route: "/question-of-the-day"`).

**Given** the router,
**When** `/question-of-the-day` is visited by a logged-in user,
**Then** a lazy-loaded home page renders (`meta: { title: "Question of the Day", requiresAuth: true }`),
and a backend `routers/qotd.py` is mounted under `/api/qotd` behind `Depends(get_current_user)` —
even if it exposes nothing but a placeholder until Story 1.4.

**Given** the docs tree,
**When** the app is registered,
**Then** `docs/stories/question-of-the-day/for-review/` and `.../done/` exist. (AR-1)

**Given** the existing suites,
**When** this story lands,
**Then** `pytest` and `npm test` stay green and `black`/`ruff`/ESLint/Prettier are clean on touched
files.

### Story 1.2: Curated question set & deterministic daily selection

As the platform,
I want a bundled set of typed questions and a pure function that picks one per date,
so that every user sees the same question on the same day and the choice is reproducible.

**Acceptance Criteria:**

**Given** `backend/app/data/qotd_questions.json`,
**When** it is loaded,
**Then** it is a non-empty list of questions, each with a unique `id`, a `text`, and a `type` of
`"text"` or `"scale"`; every `scale` question carries a `scale` object with integer `min < max` and
optional `min_label`/`max_label`; and a loader validates the file at import/first-use and raises on
a malformed or empty set. (FR-3, AR-3)

**Given** a calendar date and the curated set,
**When** the selection helper resolves the day's question,
**Then** it returns exactly one question id, is **pure and deterministic** (same date + same set →
same id, in any process/after restart), and covers the whole set as dates advance rather than
fixating on one entry. (FR-4, AR-4)

**Given** a `question_id` that is no longer present in the set (e.g. the file was trimmed),
**When** a stored day references it,
**Then** resolution fails loudly with a stdlib exception rather than returning a half-built question
(the router maps it to a 5xx) — the set is treated as append-mostly.

**Given** the service layer,
**When** it resolves or looks up questions,
**Then** it raises stdlib exceptions only (no `HTTPException`), and the helpers are unit-tested for
determinism, set coverage, and both question types. (NFR-4)

### Story 1.3: Shared per-day data model, repository & per-day write serialization

As the platform,
I want each day stored as one JSON file keyed by date, with every read-modify-write on a day
serialized against concurrent writers,
so that many people answering the same question at once never erase each other's answers.

**Acceptance Criteria:**

**Given** `backend/app/schemas/qotd.py`,
**When** models are defined,
**Then** Pydantic v2 models exist for `Answer` (`text: str | None`, `rating: int | None`,
`created_at`, `updated_at`), and `Day` (`schema_version`, `date`, `question_id`,
`answers: dict[str, Answer]`), with a model-level rule that an answer sets exactly one of
`text`/`rating`. (AR-5)

**Given** `backend/app/repositories/qotd_repo.py`,
**When** it reads and writes,
**Then** it is the only module touching the filesystem, stores each day at
`DATA_DIR/qotd/days/{date}.json`, `mkdir(parents=True, exist_ok=True)` on write, routes every write
through `core.storage.atomic_write_json`, returns a fresh empty `Day` for a date with no file yet,
and lists days by **scanning the directory** (no index file). (NFR-2, NFR-3, AR-2)

**Given** a date value that is not a canonical `YYYY-MM-DD` (separators, `..`, padding, wrong shape),
**When** the repo derives a path from it,
**Then** it raises `ValueError` rather than reading or writing outside `days/`. (NFR-2)

**Given** the platform lock (`core.locks.key_lock`) and atomic storage,
**When** the repo serializes a mutation,
**Then** it does so via a `day_transaction(date)` context manager that holds the per-day lock across
read→write and writes nothing if the block raises — it does **not** define a QotD-local lock. (NFR-1)

**Given** N threads upserting answers on the **same** day,
**When** they interleave on the threadpool,
**Then** every answer survives and none is lost; and mutations of **different** days are not
serialized against each other. Both are asserted by tests verified to fail with the lock disabled.
(NFR-1)

**Given** `backend/app/services/qotd_service.py`,
**When** it decides "today" or past-vs-present,
**Then** it does so through a single server-side helper (`today()` / `now_iso()`) that every later
story shares, and the service raises stdlib exceptions only. (NFR-4, NFR-5)

### Story 1.4: Show today's question

As a user,
I want opening the app to show me today's question and date, rendered for its type,
so that I know what is being asked before I answer.

**Acceptance Criteria:**

**Given** `GET /api/qotd/today`,
**When** a logged-in user calls it,
**Then** it resolves today's date server-side, selects the day's question (Story 1.2), and returns
the question (`id`, `text`, `type`, and `scale` bounds/labels when scale), today's `date`, and
**whether the caller has already answered** (`answered: bool`) — but **not** other users' answers
(that is Epic 3's answer-to-reveal). (FR-5, FR-2)

**Given** the question is `type: "text"`,
**When** the home page renders,
**Then** it shows the prompt with a read-only preview of where the written response will go; given a
`scale` question, it shows the scale's range and end labels. (FR-5)

**Given** the frontend,
**When** it loads today's question,
**Then** it goes through `useApi` only, and a Pinia store (`useQotdStore` or equivalent) exposes
`loading` and `error`, sets `loading` in a `try/finally`, and routes failures into `error.value`
(no bare `console.error`). (NFR-4)

**Given** the API contract,
**When** the endpoint responds,
**Then** fields are snake_case, serialization is direct (no envelope), errors are `{detail}`, and
timestamps are ISO-8601. (NFR-4)

---

## Epic 2: Answer the question

Let a user participate. This epic adds the write path (both question types), the answer form, and
the edit-while-today / locked-when-past rules. It builds only on Epic 1 and stands alone: after it,
a user can answer and revise today's question, and the server refuses to touch a past day.

### Story 2.1: Answer today's question (write endpoint & store action)

As a user,
I want to submit my answer to today's question and have it saved under my name,
so that my response is recorded once per day.

**Acceptance Criteria:**

**Given** `PUT /api/qotd/today/answer` with a body carrying `text` (for a text question) or `rating`
(for a scale question),
**When** a logged-in user submits,
**Then** the answer is stored under **their JWT username** in today's day file, exactly one answer
per user per day (a resubmit **upserts**, stamping `updated_at`), and the endpoint returns the
caller's saved answer. (FR-6, FR-7, FR-8, FR-2)

**Given** a body whose shape does not match the day's question type (a `rating` for a text question,
`text` for a scale question, a `rating` outside the question's `min..max`, empty/whitespace-only
`text`),
**When** it is validated,
**Then** the service raises `ValueError` and the router returns `422`/`400` with `{detail}` — nothing
is written. (FR-7)

**Given** concurrent submissions to today by different users,
**When** they run,
**Then** the write goes through `day_transaction(today)` so every answer survives (NFR-1); the
username is derived from the token and a `user`/`username` field in path or body is ignored/rejected
(FR-2).

**Given** the frontend store,
**When** it submits an answer,
**Then** it calls the endpoint via `useApi`, sets `loading`/`error` correctly, and on success updates
the caller's own answer and the `answered` flag in state. (NFR-4)

### Story 2.2: The answer form UI (text & scale)

As a user,
I want an input that matches the question — a text box or a rating control — with a clear submit,
so that answering feels natural for whatever is being asked.

**Acceptance Criteria:**

**Given** today's question is `type: "text"`,
**When** the answer form renders,
**Then** it shows a textarea and a submit control; submitting a non-empty response saves it via the
store (Story 2.1) and the UI then shows the user's saved answer. (FR-6)

**Given** today's question is `type: "scale"`,
**When** the answer form renders,
**Then** it shows a rating/scale control bounded by the question's `min..max` with its end labels,
and submitting a chosen value saves it via the store. (FR-7)

**Given** a submission fails,
**When** the store surfaces `error`,
**Then** the form shows the `{detail}` message and the user can retry without losing their input; the
submit control reflects `loading` while in flight. (NFR-4)

**Given** the user has already answered today,
**When** the page loads,
**Then** the form is pre-filled with their saved answer (setting up the edit affordance completed in
Story 2.3), not a blank input. (FR-8)

### Story 2.3: Edit today's answer, and lock days that have passed

As a user,
I want to change my answer while it is still today but be stopped once the day has passed,
so that I can refine a response in the moment without rewriting history.

**Acceptance Criteria:**

**Given** the user has an answer for today,
**When** they change it and resubmit,
**Then** the same answer is replaced in place (upsert), `updated_at` is bumped and `created_at` is
preserved, and the day still holds exactly one answer for them. (FR-8)

**Given** a write targeting **any day other than today** (a past date, whether via a dated endpoint
or a stale client),
**When** it reaches the service,
**Then** it is rejected — the past/present boundary is decided by the server-side helper from Story
1.3, `today` itself counts as still-writable, and nothing is written. (FR-9, NFR-5)

**Given** a past day is viewed,
**When** the UI renders it,
**Then** there is no answer form — it is presented read-only — and any attempt to submit is refused
by the server with a `{detail}` error even if the UI is bypassed. (FR-9)

**Given** the boundary logic,
**When** it is tested,
**Then** tests cover: editing today succeeds; a write to yesterday is refused; and the today→past
transition is driven by the injectable/server `today()` (not the client clock), verified without
sleeping until midnight. (NFR-5)

---

## Epic 3: See everyone's answers & browse history

Deliver the social payoff and the archive. This epic reads what Epics 1–2 wrote: today's feed
(gated behind answer-to-reveal) and the always-visible history of past days. It adds no new write
paths.

### Story 3.1: Today's shared feed (answer-to-reveal)

As a user who has answered today,
I want to read everyone else's answers to today's question,
so that answering is rewarded with seeing how the group responded.

**Acceptance Criteria:**

**Given** the caller has **not** answered today,
**When** they request today's answers,
**Then** other users' answers are **withheld** — the response reveals only that answering is required
first (and the count may be hidden or shown as a teaser, but never the contents). (FR-10)

**Given** the caller **has** answered today,
**When** they request today's answers,
**Then** every answer for today is returned, each **attributed to its author** (username) and typed
correctly (text or rating), ordered stably (e.g. by `created_at`). (FR-10)

**Given** the reveal boundary,
**When** it is enforced,
**Then** it is enforced **server-side** — a user who has not answered cannot obtain today's answers
by calling the API directly — and "has answered" is derived from the stored day, not a client flag.
(FR-10, FR-2)

**Given** the frontend,
**When** the user answers today,
**Then** the feed unlocks in place (re-fetch or returned-with-write) via `useApi`, with `loading`/
`error` handled by the store. (NFR-4)

### Story 3.2: Browse the history of past days

As a user,
I want a reverse-chronological list of past questions,
so that I can revisit what the group has been asked over time.

**Acceptance Criteria:**

**Given** `GET /api/qotd/history`,
**When** a logged-in user calls it,
**Then** it returns past days (today excluded) newest-first, each with its `date`, the question
`text` (resolved from the stored `question_id`), and its `type` — by scanning the days directory,
not an index. (FR-11, AR-2)

**Given** days exist with no answers (a question was surfaced but nobody answered),
**When** history is built,
**Then** those days still appear (the question was asked); an implementation may instead choose to
list only days that have a file — document whichever, and test it — but the list is never silently
truncated. (FR-11)

**Given** the history view,
**When** it renders,
**Then** it lists the days via `useApi` with store `loading`/`error`, shows a calm empty state when
there are no past days yet, and each row links to that day (Story 3.3). (FR-11, NFR-4)

### Story 3.3: Read a past day (question + all answers, read-only)

As a user,
I want to open a past day and read its question and everyone's answers,
so that I can see the full record of any previous day.

**Acceptance Criteria:**

**Given** `GET /api/qotd/days/{date}` for a **past** date,
**When** a logged-in user calls it,
**Then** it returns that day's question (resolved from `question_id`) and **all** answers attributed
to their authors, **always visible** — past days are not gated behind answer-to-reveal. (FR-12)

**Given** a `{date}` that is malformed or in the future,
**When** it is requested,
**Then** the router returns `400`/`404` with `{detail}` (malformed rejected by the repo's date
validation; a future/never-surfaced date is a `404`), and never reads outside `days/`. (NFR-2, FR-12)

**Given** a past day is opened in the UI,
**When** it renders,
**Then** it shows the question and the group's answers read-only (no form, per Story 2.3), reachable
from the history list (Story 3.2), loaded via `useApi` with store `loading`/`error`. (FR-12, NFR-4)
