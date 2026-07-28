---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - docs/planning-artifacts/prds/prd-application-dock-2026-06-10/prd.md
  - docs/planning-artifacts/architectures/architecture-application-dock-2026-06-12/architecture.md
  - docs/planning-artifacts/ux-designs/ux-application-dock-2026-06-10/DESIGN.md
  - docs/planning-artifacts/ux-designs/ux-application-dock-2026-06-10/EXPERIENCE.md
---

# Hotaru (Japanese Vocabulary) - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for **Hotaru**, a Japanese vocabulary-learning app shipped as a new self-contained app inside the Application Dock platform. It decomposes the PRD requirements, UX design, and architecture decisions into implementable stories. Platform-wide architecture is inherited (not re-built). Stories live under `docs/stories/hotaru/`.

## Requirements Inventory

### Functional Requirements

**F1 — App Integration & User Identity**
- FR-1: App registered in the Application Dock shell (card on landing, own route).
- FR-2: User identifies as one of two hardcoded users (Dani/Jake) on entry and can switch; progress, private words, and private notes are scoped to the active user. No auth.

**F2 — Vocabulary Library & Organization**
- FR-3: Single shared Master Vocabulary List across both users.
- FR-4: Word record (Japanese reading, optional kanji, romaji, English meaning, optional part-of-speech, lesson tag, topics, shared/private flag, owner).
- FR-5: Organize/browse Words by Lesson (textbook + chapter).
- FR-6: Create Topics and assign/unassign Words; Topics are shared; a Word may belong to many.
- FR-7: Mark a Word shared or private; a Private Word is visible/drillable only to its creator; per-user familiarity on shared words is independent.
- FR-8: Low-friction manual Word entry (3 required fields; immediately drillable).
- FR-9: Seed the Master Vocabulary List with a pre-assembled Genki dataset organized by Lesson.

**F3 — Practice Session**
- FR-10: Activity & scope picker — choose word drill + exactly one Scope (a Lesson or a Topic).
- FR-11: Pre-session overview — Word count in scope + per-user Familiarity distribution.
- FR-12: Anki-style flashcard flow — one Word at a time, prompt → reveal → grade → advance.
- FR-13: Direction toggle — JP→EN (recognition) or EN→JP (production).
- FR-14: Scoring mode — Self-grade (Correct/Close/Incorrect) or Typed (EN→JP only, exact-match kana; non-match → reveal + self-grade).
- FR-15: Grade recording updates the active user's Familiarity for the Word.
- FR-16: Attach a Note to the current Word mid-session (shared or private).
- FR-17: Session summary — Words practised + remaining + updated Familiarity.
- FR-18: Calm session bounds — session-bounded with a clean end; no due-counts/backlog anywhere.

**F4 — Spaced Repetition & Familiarity**
- FR-19: Automatic, invisible scheduling — favour weaker/due Words within scope; no intervals/due dates/counts surfaced.
- FR-20: Familiarity model — per-user, per-word; Correct ↑, Close ↑ less, Incorrect ↓; 5 discrete tiers.
- FR-21: Familiarity displayed as a subtle per-Word signal (icon + colour) for the active user.

**F5 — Shared Per-Word Notes**
- FR-22: Create free-form Note(s) on any visible Word (multiple allowed; stores text + author).
- FR-23: Flag each Note shared or private at creation; the author can flip visibility later.
- FR-24: Shared Notes visible to both users (incl. during a drill); Private Notes only to their author.

### NonFunctional Requirements

- NFR-1: Mobile-only phone web — single-column, full-bleed; no wider-screen layouts.
- NFR-2: Per-user privacy isolation — private Words & Notes never visible to the other user (enforced as a path boundary, not a service filter). The one hard data rule.
- NFR-3: No authentication (LAN/household; two hardcoded users).
- NFR-4: JSON files on disk, atomic writes, no database; repo-only file I/O.
- NFR-5: Calm guardrail — no streaks/leaderboards/due-counts; the drill-queue API returns a queue, never a debt (no due-counts/overdue/next_review_at in response schemas).
- NFR-6: Performance — snappy on a phone; master list (≤5,000 words, ~1,000 typical) held in memory; drill card flip is instant (batch-fetch queue + optimistic local grading + background sync).
- NFR-7: Accessibility — Familiarity never relies on colour alone (icon + label + colour); `prefers-reduced-motion` → static fireflies; adequate tap targets; legible Japanese glyphs.
- NFR-8: Platform conformance — 3-layer backend, `useApi` single HTTP boundary, registry + lazy routes, Pinia stores expose `loading`/`error`; snake_case JSON, direct serialization, `{detail}` errors, ISO-8601 dates.

### Additional Requirements

*(From the Architecture — technical work items that shape epics/stories.)*

- AR-1: **Offline seed-dataset prep tool** (`scripts/build_hotaru_seed.py`) — build step one, outside the served app: read raw Genki list → assign stable Word IDs (`{edition}-{lesson}-{seq}`), compute `drill_caps`, stamp `schema_version` → committed read-only `app/hotaru_seed/vocab_seed.json`.
- AR-2: **App registration** — registry entry + lazy routes + backend `routers/hotaru.py` + `apps/hotaru/` skeleton + `docs/stories/hotaru/{for-review,done}/`.
- AR-3: **Data layout** — read-only shipped seed + writable per-ownership files under `DATA_DIR/hotaru/` (`vocab_shared.json`, `topics.json`, `notes_shared.json`, `users/{user}/{progress,words_private,notes_private}.json`); repos `mkdir(parents=True)`.
- AR-4: **Repository decomposition** — shared `_storage.py` (atomic write/read) + thin per-aggregate repos (`vocab_repo`, `progress_repo`, `notes_repo`, `topic_repo`).
- AR-5: **Pure SRS service** — `services/srs.py` `next_review(state, grade, now)` with injected `now`; tiers/intervals `[same-session,1d,3d,7d,21d]`, exponential advancement `[1,3,9,18]`.
- AR-6: **API contract** — `/api/hotaru/*`; `user` query-param validated against the two users; queue-not-debt response models; batch `POST /practice/grades`; session-queue soft cap (default 20, tunable).
- AR-7: **Schemas** — Pydantic v2 models + string enums (`DrillCap`, `Grade`); `kanji "" → None`; `schema_version` + `migrate()` on seed read.
- AR-8: **AI-readiness (Phase II, no v1 code)** — stable IDs + open-shaped JSON objects only; NO AI fields/services in v1.

### UX Design Requirements

*(From DESIGN.md + EXPERIENCE.md — first-class work items.)*

- UX-DR1: **Theme tokens** — forest-twilight palette (moss green-brown field, bamboo-green accent, beige/washi surfaces, lamp-yellow practiced word, firefly glow, 5-tier familiarity ramp) added to `quasar.variables.sass` + `app.sass`, extending Quasar.
- UX-DR2: **FireflyLayer** component — wandering CSS fireflies with soft glow halos; rendered behind panels (~50% dimmer over cards); `prefers-reduced-motion` → static dim dots.
- UX-DR3: **FamiliarityIcon** component — distinct icon per 5 tiers (glyphs TBD), always icon + colour + label (never colour alone).
- UX-DR4: **Flashcard** component — elevated/frosted card with ambient glow; practiced Japanese word in warm glowing lamp-yellow; prompt + reveal states.
- UX-DR5: **GradeButtons** component — three bare buttons Incorrect / Close / Correct (no subtext).
- UX-DR6: **CategoryPills** component — tiny pills along the card's bottom edge with a CSS-only "＋N / − less" overflow toggle.
- UX-DR7: **AvatarSwitcher** (top bar) — current-user avatar opening Switch-user + Settings; plus the "Who's studying?" IdentityPage.
- UX-DR8: **Library/Notes UI** — WordRow (familiarity + shared/private mark), Lesson + Topic filter tabs, AddWord form (3 required + optional + shared/private toggle), NoteList + AddNote (shared implicit; 🔒 only on private; author attribution; inline add in detail view).
- UX-DR9: **Voice & Tone** — calm-is-the-manner microcopy rules (e.g. "Let's practice", "Worth a revisit", bare grade labels; no streak/due/urgency language).
- UX-DR10: **Key flows** — realize UJ-1 (Jake drills), UJ-2 (Dani adds a word), UJ-3 (Dani finds Jake's note) across the pages; full-bleed mobile single-column.

### FR Coverage Map

- FR-1: Epic 1 — app registered in shell
- FR-2: Epic 1 — user identity selection / switching
- FR-3: Epic 1 — shared Master Vocabulary List
- FR-4: Epic 1 — Word record schema
- FR-5: Epic 1 — organize/browse by Lesson
- FR-6: Epic 1 — create/assign shared Topics
- FR-7: Epic 1 — shared vs private Words
- FR-8: Epic 1 — manual Word entry
- FR-9: Epic 1 — Genki seed dataset
- FR-10: Epic 2 — activity & scope picker
- FR-11: Epic 2 — pre-session overview
- FR-12: Epic 2 — flashcard flow
- FR-13: Epic 2 — direction toggle
- FR-14: Epic 2 — scoring mode (self-grade / typed)
- FR-15: Epic 2 — grade recording → familiarity
- FR-16: Epic 3 — attach note mid-drill
- FR-17: Epic 2 — session summary
- FR-18: Epic 2 — calm session bounds
- FR-19: Epic 2 — automatic scheduling
- FR-20: Epic 2 — familiarity model
- FR-21: Epic 2 — familiarity display
- FR-22: Epic 3 — create note(s)
- FR-23: Epic 3 — note visibility (set + flip)
- FR-24: Epic 3 — partner sees shared notes (incl. mid-drill)

## Epic List

### Epic 1: Foundation & Vocabulary Library
Dani and Jake can open Hotaru, choose who's studying, and browse/organize a shared Japanese vocabulary — seeded from Genki and extendable with their own words. Delivers the seed dataset, app registration, the data layer, identity, and the library/organization surface.
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9
**Supporting:** AR-1 (seed tool), AR-2 (registration), AR-3 (data layout), AR-4 (repos), AR-7 (schemas); NFR-1/2/3/4/8; UX-DR1, UX-DR7, UX-DR8.

### Epic 2: Drilling & Spaced Repetition
They can practise — pick a Lesson/Topic, drill it Anki-style in either direction with their chosen scoring, and watch each word's familiarity firm up — calm, with no debt. The core practice loop plus the SRS/familiarity engine.
**FRs covered:** FR-10, FR-11, FR-12, FR-13, FR-14, FR-15, FR-17, FR-18, FR-19, FR-20, FR-21
**Supporting:** AR-5 (pure SRS), AR-6 (queue-not-debt API); NFR-5/6/7; UX-DR2, UX-DR3, UX-DR4, UX-DR5, UX-DR6, UX-DR9, UX-DR10 (UJ-1).

### Epic 3: Cooperative Notes
They can leave each other memory hacks on any word — shared or private — and discover their partner's tips, including mid-drill. Notes, including the mid-drill attach that enhances the Epic-2 drill.
**FRs covered:** FR-16, FR-22, FR-23, FR-24
**Supporting:** UX-DR8 (notes UI); UJ-2, UJ-3.

**Dependencies:** Epic 1 standalone; Epic 2 builds on Epic 1; Epic 3 builds on Epics 1–2. No epic requires a future epic (FR-16 sits in Epic 3, so the Epic-2 drill never depends on notes).

## Epic 1: Foundation & Vocabulary Library

Dani and Jake can open Hotaru, choose who's studying, and browse/organize a shared Japanese vocabulary — seeded from Genki and extendable with their own words.

### Story 1.1: Prepare the Genki seed dataset (offline)

As the project owner,
I want an offline tool that turns the raw Genki word list into a prepared, ID-stamped seed dataset,
So that the app has canonical, drillable vocabulary content to ship.

**Acceptance Criteria:**

**Given** the raw source array (`{hiragana, kanji, romaji, type, english, lesson, edition}`, no IDs)
**When** `scripts/build_hotaru_seed.py` runs
**Then** it writes `backend/app/hotaru_seed/vocab_seed.json` containing each word with a stable `id` (`"{edition}-{lesson}-{seq}"`, `seq` zero-padded width 4), `kanji` normalized (`"" → null`), computed `drill_caps`, and a top-level `schema_version`.

**Given** the computed `drill_caps`
**When** a word has reading + meaning (always) and `kanji` present/absent
**Then** every word includes `r2m` and `m2r`; `k2r` is present **iff** `kanji is not null`.

**Given** two source rows that would mint the same `id`
**When** the tool runs
**Then** it fails loudly with an error (no silent collision).

### Story 1.2: Register Hotaru in the Application Dock shell

As a learner,
I want Hotaru to appear as an app in the dock and open to its home,
So that I can launch it like any other app.

**Acceptance Criteria:**

**Given** the dock landing page
**When** it renders the app registry
**Then** a Hotaru card appears (label + icon) and selecting it routes to Hotaru's home (FR-1).

**Given** the new app module
**When** the project is set up
**Then** `src/apps/hotaru/` exists (self-contained, shell imports only `registry.ts`), a backend `routers/hotaru.py` is mounted under `/api/hotaru`, the forest-twilight theme tokens (UX-DR1) are added to the Sass variables, and `docs/stories/hotaru/{for-review,done}/` exist.

### Story 1.3: Choose who's studying

As a learner,
I want to pick whether I'm Dani or Jake on entry and switch later,
So that my progress and private content stay mine.

**Acceptance Criteria:**

**Given** Hotaru is opened
**When** no active user is set
**Then** a "Who's studying?" screen offers Dani and Jake (no password); selecting one sets the active user (FR-2).

**Given** an active user
**When** I open the top-bar avatar menu
**Then** I can switch to the other user and reach Settings; the active user drives the `user` param sent to the API (validated server-side against the two users).

### Story 1.4: Browse the vocabulary library by Lesson

As a learner,
I want to see the shared vocabulary organized by Genki lesson,
So that I can find the words I'm studying.

**Acceptance Criteria:**

**Given** the shipped seed
**When** the library loads
**Then** `vocab_repo` reads `vocab_seed.json` (running `migrate()` on `schema_version`) and `GET /api/hotaru/words` returns the master list assembled from seed + shared + the active user's private words (FR-3, FR-9).

**Given** the Library page
**When** I filter by a Lesson (textbook + chapter, derived from `lesson`+`edition`)
**Then** I see that lesson's words as rows (Japanese, reading, meaning) (FR-4, FR-5), full-bleed and mobile-single-column.

### Story 1.5: Add a word manually

As a learner,
I want to quickly add a word I encountered,
So that I'm not limited to the textbook.

**Acceptance Criteria:**

**Given** the Add-word form
**When** I submit the 3 required fields (reading, meaning, and either kanji or none) and optional fields
**Then** `POST /api/hotaru/words` persists it (to `vocab_shared.json` or the user's `words_private.json` per its flag) with a `u-{uuid8}` id, and it is immediately drillable and visible in the library (FR-8).

**Given** a submission missing a required field
**When** I submit
**Then** the API rejects it with a `{detail}` error and the form shows the problem.

### Story 1.6: Mark a word shared or private

As a learner,
I want to choose whether a word I add is shared with my partner or kept private,
So that I control what we co-build.

**Acceptance Criteria:**

**Given** I add or edit a word
**When** I set it shared or private
**Then** a shared word is visible/drillable to both users; a private word is stored under `users/{me}/words_private.json` and is visible/drillable only to me (FR-7).

**Given** the other user's library
**When** it loads
**Then** my private words are absent from the response payload (privacy enforced at the repo path, verified by test).

### Story 1.7: Organize words into Topics

As a learner,
I want to group words into my own topics,
So that I can practise themes beyond textbook lessons.

**Acceptance Criteria:**

**Given** the library
**When** I create a named Topic and assign/unassign words
**Then** the Topic and its membership persist in shared `topics.json`, are visible to both users, and a word may belong to many topics (FR-6).

**Given** the Library filter
**When** I filter by a Topic
**Then** I see that topic's words (private words still follow FR-7 visibility).

### Story 1.8: Edit or delete a custom word

_Added 2026-07-06 — not from an original FR. Once users can add words (Story 1.5), they need to fix or remove their own; the seeded Genki words stay read-only._

As a learner,
I want to edit or delete a word I added,
So that I can fix mistakes and remove words I no longer want.

**Acceptance Criteria:**

**Given** a custom word (one whose `source` is a user id), when I view it, then I can edit its fields or delete it; seeded (textbook) words are read-only and expose no edit/delete.

**Given** I delete a custom word (`DELETE /api/hotaru/words/{id}?user=`), when it is removed, then it is dropped from its writable file (`vocab_shared.json` or the owner's `words_private.json`) and disappears from the library; a private word can only be deleted by its owner.

**Given** I edit a custom word (`PATCH /api/hotaru/words/{id}?user=`), when I save, then its fields (reading/meaning/kanji/romaji/pos/lesson/visibility) update in place; changing visibility moves it between the shared and the owner's private file; `id` and `drill_caps` stay consistent (drill_caps recomputed from kanji).

**Given** any attempt to edit or delete a seeded word or another user's private word, when made, then it is rejected (403/404) — the seed is never mutated.

### Story 1.9: Bulk actions on library words

_Added 2026-07-11 — not from an original FR. As the library grows (seed + custom + topics), one-at-a-time management is tedious; batch operations make curation practical. Builds on 1.6/1.7/1.8._

As a learner,
I want to select several words in the library and act on them at once,
So that I can organize and clean up vocabulary without repeating the same action word by word.

**Acceptance Criteria:**

**Given** the library list, **when** I enter a selection mode (a "Select" affordance / long-press), **then** I can multi-select words via checkboxes, see a running count of what's selected, and clearing/leaving selection mode drops the selection. Mobile-first: selection and the batch-action bar work one-handed on a narrow screen.

**Given** a multi-selection, **when** I choose **Assign to topic** / **Remove from topic**, **then** the chosen topic membership is applied to every selected word in one batch (reusing the topic assign/unassign endpoints), respecting per-word visibility (FR-6, FR-7).

**Given** a multi-selection of **custom** words, **when** I choose **Change lesson**, **then** their `lesson` updates in place (via the existing word-update path); seeded (textbook) words are read-only and are excluded from the change (seed read-only per 1.8).

**Given** a multi-selection of custom words, **when** I choose **Delete**, **then** I confirm once for the whole batch and each deletable word is removed (private words only by their owner); seeded words cannot be deleted (403/404 per 1.8).

**Given** a batch where some words are ineligible (seeded, or another user's private word), **when** the action runs, **then** it applies to the eligible words and the UI clearly reports what was skipped and why — no partial silent failures.

_Implementation note: reuse the existing per-word endpoints (looped client-side) or add a small batch endpoint — either way keep the 3-layer backend and queue-not-debt conventions; no new debt/streak surfaces._

## Epic 2: Drilling & Spaced Repetition

Dani and Jake can practise a chosen scope Anki-style — in either direction, with their preferred scoring — and watch each word's familiarity firm up, calm and debt-free.

### Story 2.1: Spaced-repetition engine & familiarity model

As a learner,
I want the system to track how well I know each word and decide what's worth showing,
So that practice focuses on what I'm shaky on without me managing it.

**Acceptance Criteria:**

**Given** a pure `services/srs.py`
**When** `next_review(state, grade, now)` is called (with **injected** `now`)
**Then** it returns updated `{tier, points, last_reviewed_at}`: Correct adds +1 point (on reaching the tier threshold `[1,3,9,18]` → +1 tier, points reset 0); Close holds; Incorrect drops one tier (floor New), points reset (FR-20).

**Given** a word's `{tier, last_reviewed_at}`
**When** "due" is evaluated
**Then** it derives from `last_reviewed_at + interval[tier]` (`[same-session, 1d, 3d, 7d, 21d]`), and is never persisted.

**Given** `progress_repo`
**When** state is read/written
**Then** it uses `users/{user}/progress.json`; the SRS service has no file or clock dependency (table-tested at tier/point boundaries).

### Story 2.2: Choose what to practise

As a learner,
I want to pick a lesson or topic and see how I'm doing on it before I start,
So that I can decide where to spend a session.

**Acceptance Criteria:**

**Given** the picker
**When** I choose word drill and exactly one Scope (a Lesson or a Topic)
**Then** the session targets that scope (FR-10).

**Given** a chosen scope
**When** the pre-session overview loads (`GET /api/hotaru/practice/overview`)
**Then** it shows the word count and the active user's familiarity distribution — and exposes **no** due-counts/overdue (FR-11, NFR-5).

### Story 2.3: Drill a session

As a learner,
I want to flip through the scope's words one at a time,
So that I can review efficiently in a calm, bounded session.

**Acceptance Criteria:**

**Given** a chosen scope
**When** I start (`GET /api/hotaru/practice/queue`)
**Then** the service returns an ordered queue of the most-worth-reviewing words (weakest/due first), filtered to the word's `drill_caps`, soft-capped to the session size (default 20), with **no** due-debt in the response schema (FR-12, FR-19, FR-18, NFR-5).

**Given** a drill card
**When** I view and reveal it
**Then** one word shows at a time (prompt → reveal), the practiced Japanese renders in glowing lamp-yellow, fireflies drift behind the panel (dimmed over the card; static under `prefers-reduced-motion`) (UX-DR2/4).

**Given** the session ends or I stop
**When** the queue is exhausted
**Then** the session has a clean end with no penalty or backlog wall (FR-18).

### Story 2.4: Practise in either direction

As a learner,
I want to choose recognition or production,
So that I can test myself the way I want today.

**Acceptance Criteria:**

**Given** the picker (and a per-session toggle on the drill)
**When** I choose **JP→EN**
**Then** the card shows the Japanese and I recall the meaning.

**Given** I choose **EN→JP**
**When** the card shows
**Then** it shows the meaning and I produce the Japanese (FR-13). Words lacking the data for a chosen direction are excluded via `drill_caps`.

### Story 2.5: Grade a card and update familiarity

As a learner,
I want to record how I did — by self-grading or by typing the answer,
So that the system learns what to show me next.

**Acceptance Criteria:**

**Given** Self-grade mode
**When** I reveal a card
**Then** I choose **Incorrect / Close / Correct** (bare labels, no subtext) and advance (FR-14, UX-DR5).

**Given** Typed mode (EN→JP only)
**When** I type kana and submit
**Then** an exact match records Correct; a non-match reveals the answer and lets me self-grade Correct/Close/Incorrect (FR-14).

**Given** grades during a session
**When** I grade
**Then** familiarity updates **optimistically in the local store** and grades sync in a **batch** to `POST /api/hotaru/practice/grades` in the background; the server applies `srs.next_review` and writes `progress.json` (FR-15, NFR-6).

**Given** I switch user mid-session
**When** the switch occurs
**Then** pending grades (attributed to the prior user) are flushed and the in-progress queue is discarded.

### Story 2.6: See how well I know each word

As a learner,
I want a gentle, glanceable signal of my familiarity,
So that I can see progress without pressure.

**Acceptance Criteria:**

**Given** the library, word rows, and pre-session overview
**When** they render for the active user
**Then** each word shows a 5-tier familiarity indicator as **icon + colour + label** (never colour alone) (FR-21, UX-DR3, NFR-7).

### Story 2.7: Finish with a session summary

As a learner,
I want a small recap when I finish,
So that the session feels complete.

**Acceptance Criteria:**

**Given** a completed session
**When** the summary shows
**Then** it reports words practised and how many remain in scope, reflects updated familiarity, and shows **no** streak or due-count (FR-17, FR-18).

### Story 2.8: Study a scope (browse, no grading)

_Added 2026-07-06 — not from an original FR. A calm, pressure-free companion to the graded drill: sometimes you just want to read through the words, not be tested. Reuses the picker's scope selection._

As a learner,
I want to browse a lesson or topic's words one at a time with everything on the card,
So that I can study freely without being graded.

**Acceptance Criteria:**

**Given** the pre-session picker with a chosen scope
**When** I choose **Study** (alongside **Practice**)
**Then** I enter a browse flow over that scope's words (`GET /api/hotaru/practice/study?scope=&user=`) — **all** the scope's words in natural (lesson/list) order, no SRS weighting and no session cap.

**Given** a study card
**When** it shows
**Then** a single card presents **all** the word's info at once (Japanese headword, reading, romaji, meaning, part of speech) in the neon card style (kanji cyan / kana lamp-yellow) — there is **no** prompt→reveal and **no** grade; **"Next word"** simply advances to the next card.

**Given** the last card
**When** I advance past it
**Then** the study session ends cleanly (a "that's all" state with a way back), with no penalty, streak, or due-count. An empty scope shows a graceful empty state.

### Story 2.9: Quick Practice (presets across the whole library)

_Added 2026-07-11 — extends FR-10 (which scopes a session to exactly one Lesson or Topic). Quick Practice builds a session from the **whole** visible list using familiarity/level presets instead of a single scope. Depends on 2.1/2.6 (familiarity) and reuses the 2.3/2.5 drill flow unchanged._

As a learner,
I want a "Quick Practice" option when I haven't picked a lesson or topic,
So that I can start a focused session drawn from my whole vocabulary using presets, without hand-picking a scope.

**Acceptance Criteria:**

**Given** the Practice screen with **no** Lesson/Topic selected (the all-words view), **when** it renders, **then** a **Quick Practice** affordance offers preset ways to build a session from the whole (visible, privacy-correct) list — sitting alongside the all-words stats, not replacing per-scope practice (FR-10 extension).

**Given** Quick Practice, **when** I choose a **familiarity** preset, **then** I can practise e.g. *seen at least once*, *only Learning / Familiar / Strong / Mastered*, or *needs work* (weaker tiers) — sourced across all lessons/topics for the active user (FR-19, FR-20, FR-21).

**Given** Quick Practice, **when** I choose a **lesson/level** preset, **then** I can combine several lessons and/or restrict to certain levels (e.g. "Lessons 1–5", "L3 + L7") and practise the union (FR-5, FR-10 extension).

**Given** a built Quick Practice queue, **when** it is assembled (practice queue/overview endpoints extended with preset params — e.g. familiarity tiers, a lesson set), **then** it obeys the same rules as a scoped drill: SRS weighting (weakest/due first), `drill_caps` direction filter, session soft-cap (default 20), and **no** due-debt in the response (FR-12, FR-18, FR-19, NFR-5).

**Given** the active user's presets, **when** I return to Quick Practice, **then** my last-used preset is remembered (persisted per user) so re-entry is genuinely quick; a preset matching no words shows a calm empty state ("nothing to practise here yet"), never an error.

### Story 2.10: Filter the library by familiarity (and jump there from practice stats)

_Added 2026-07-11 — depends on the familiarity model/display (2.1, 2.6) and the pre-session stats (2.2). Turns the read-only familiarity signal into a navigational filter. Its primary deliverable is a **Library** filter, placed in Epic 2 because it needs Epic-2 familiarity data + the practice stats it links from._

As a learner,
I want to filter the library by familiarity and jump straight to a familiarity group from my practice stats,
So that I can find and act on exactly the words at a given level (e.g. everything I've mastered, or everything still New).

**Acceptance Criteria:**

**Given** the library, **when** I apply a **familiarity filter** (one or more of the 5 tiers), **then** the list shows only the active user's words at those tiers, combinable with the existing Lesson/Topic/Custom navigation, using the per-word familiarity already available (`GET /api/hotaru/practice/familiarity`) (FR-21, UX-DR3). Mobile-first: a compact tier control reusing `FamiliarityIcon`, not a wide toolbar.

**Given** the Practice pre-session stats table — the all-words view **or** a selected Lesson/Topic — **when** I tap a familiarity group/row, **then** I'm navigated to the Library with that tier filter pre-applied **and** the originating scope respected: no scope → the whole library; a selected Lesson/Topic → that lesson/topic pre-selected (FR-11, FR-21). Deep-linked via route query (e.g. `/hotaru/library?tier=4&scope=lesson:L2`).

**Given** a familiarity filter yields no words, **when** the list renders, **then** it shows a calm empty state and the filter can be cleared to return to the full view.

**Given** an active filter, **when** familiarity has changed (e.g. after a session), **then** reopening/refreshing the library reflects the updated tiers (familiarity is read fresh, never stale).

### Story 2.11: Show my typed answer on self-grade

_Added 2026-07-19 — refines FR-14 (typed scoring). On a typed-mode miss the answer reveals for self-grade, but the learner couldn't see what they typed. Design agreed in the UX decision-log (2026-07-19): keep the answer as-is; show the submitted answer as a quiet muted line beneath it (diff-highlight variants rejected)._

As a learner drilling in typed mode,
I want to see what I typed next to the correct answer when I miss,
So that I can fairly judge whether I was Correct, Close, or Incorrect.

**Acceptance Criteria:**

**Given** typed mode (EN→JP) and a non-exact submission
**When** the answer reveals
**Then** my submitted text shows beneath the (unchanged, still-prominent) answer as a quiet "you wrote" line — no diff/highlight; an empty submission reads "you wrote —"; self-grade mode / an exact match show no such line.

### Story 2.12: Direction & Scoring on Quick Practice

_Added 2026-07-19 — refines Quick Practice (2.9), which always launched JP→EN self-grade. Surface the existing Direction (JP→EN / EN→JP) and Scoring (Self-grade / Typed) controls on the Quick Practice flow too._

As a learner using Quick Practice,
I want to choose direction and scoring the same way I can for a lesson or topic,
So that a whole-library session isn't locked to JP→EN self-grade.

**Acceptance Criteria:**

**Given** the Quick Practice view
**When** it renders
**Then** the Direction + Scoring segmented controls are present (the same as for a chosen scope), Typed stays EN→JP-only, and starting the session launches the drill with the chosen `direction`/`mode` (not hardcoded `r2m`/`self`); the scoped picker is unchanged. Frontend-only.

### Story 2.13: Calm the Practice setup screen (collapsed accordion)

_Added 2026-07-19 — the setup screen grows too tall once Lessons/Topics become full browsable lists. Redesign it as one calm accordion (Sally's Design 1 of the whole-screen comparison): an ambient familiarity ramp, a collapsible Quick Practice card that opens its settings inline before Start, and Lessons/Topics as collapsible lists of scope rows — one region open at a time._

As a learner opening Practice on my phone,
I want the setup screen to stay short and calm even when my Lessons and Topics lists are long,
So that choosing what to practise never means scrolling past a wall of controls.

**Acceptance Criteria:**

**Given** the Practice setup screen
**When** it renders
**Then** whole-library familiarity shows as one compact ramp; Quick Practice is a collapsible card that opens its settings (presets/count/direction/scoring) inline with a Start button (nothing launches unseen); Lessons and Topics are collapsible lists of scope rows (mini-ramp + label + count), one region open at a time; selecting a row opens an inline Study/Practice drawer. Launch behaviour and Quick logic are unchanged; familiarity stats are computed client-side (no per-scope `overview` call). Frontend-only.

## Epic 3: Cooperative Notes

Dani and Jake can leave each other memory hacks on any word — shared or private — and discover their partner's tips, including mid-drill.

### Story 3.1: Add and view notes on a word

As a learner,
I want to attach memory notes to a word and read existing ones,
So that I can capture and benefit from tips.

**Acceptance Criteria:**

**Given** a word detail view
**When** I add a note (`POST /api/hotaru/words/{id}/notes`)
**Then** it persists with text + author and appears in the word's note list, attributed; a word may carry multiple notes (FR-22).

**Given** notes on a word
**When** the list renders for the active user
**Then** it shows shared notes (no "shared" badge) and the active user's own private notes (marked 🔒); another user's private notes are absent from the payload (FR-24, NFR-2).

### Story 3.2: Set and change a note's visibility

As a learner,
I want to choose shared or private for a note, and change my mind later,
So that I control what my partner sees.

**Acceptance Criteria:**

**Given** I create a note
**When** I set Shared or Private
**Then** it's stored accordingly (`notes_shared.json` or `users/{me}/notes_private.json`) (FR-23).

**Given** a note I authored
**When** I flip its visibility (`PATCH /api/hotaru/notes/{id}`)
**Then** it moves between shared/private and the partner's view updates accordingly; I cannot change a note I didn't author.

### Story 3.3: Discover a partner's note during a drill

As a learner,
I want to see shared notes on a word while drilling it,
So that my partner's tip helps me right when I need it.

**Acceptance Criteria:**

**Given** the drill queue payload
**When** a word is served
**Then** it includes that word's shared notes + the active user's own private notes (privacy-filtered server-side) so they render in the drill without a second fetch (FR-24).

**Given** a card with a shared note
**When** I reveal it
**Then** the note is visible in the drill view.

### Story 3.4: Attach a note mid-drill

As a learner,
I want to jot a note on the current word without leaving the session,
So that I can capture a hack the moment it strikes.

**Acceptance Criteria:**

**Given** an active drill
**When** I add a note to the current word
**Then** I can write it and set shared/private inline, it persists (per Story 3.1/3.2), and the drill resumes without losing my place (FR-16).

### Story 3.5: Expandable library rows — topics & notes inline

_Added 2026-07-16 — not from an original FR. A UX composition over Epic 3 (notes, FR-22/24) and topics (FR-6/7): a library row expands in place to show a word's topics and notes and add new ones, instead of opening a separate ⋮ dialog for each. Frontend-only (reuses the 3.1 notes and 1.7 topic endpoints/stores); coexists with the ⋮ dialogs._

As a learner,
I want to expand a word's row in the library to see its topics and notes and add new ones inline,
So that I can review and enrich a word's context without opening a separate dialog for each.

**Acceptance Criteria:**

**Given** the library list
**When** I tap a row's expand affordance (a disclosure control, not the ⋮ menu)
**Then** the row expands in place to show the word's topics (as pills) and its notes (privacy-filtered: shared + my own private, attributed, 🔒 on private), and collapses again on tap — calm, mobile-first, Neon-themed, respecting `prefers-reduced-motion`.

**Given** an expanded row
**When** I assign/create a topic or add a note (text + Shared/Private, honouring the 300-char note limit)
**Then** it persists via the existing topic and notes endpoints/stores and the inline lists update — matching the ⋮ dialogs' behaviour, which remain available (no regression), and staying inert in bulk-select mode.

_New design for the expanded row is agreed in-story (a gated first task) with the user, then implemented._

### Story 3.6: Edit or delete a note

_Added 2026-07-17 — not from an original FR. Completes the note lifecycle: 3.1 add, 3.1/3.3 view, 3.2 flip visibility — but a note's text couldn't be corrected and a note couldn't be removed. Author-only, reusing the 3.2 privacy/move machinery; surfaces in the library dialog, the drill, and the inline row (all reuse `WordNotesDialog`)._

As a learner,
I want to fix the wording of a note I wrote, or remove one I no longer want,
So that our shared tips stay accurate and uncluttered.

**Acceptance Criteria:**

**Given** a note I authored
**When** I edit its text (`PATCH /api/hotaru/notes/{id}` with `{text}`) or delete it (`DELETE /api/hotaru/notes/{id}`)
**Then** the text updates in place (id/author/visibility/created_at preserved) or the note is removed — text validated like create (trimmed, non-empty, ≤300); the extended PATCH still flips visibility (3.2) when given `{visibility}`, and edit+flip compose.

**Given** a note I did not author (or a partner's private note, or an unknown id)
**When** I try to edit or delete it
**Then** it is rejected — 403 for a partner's shared note, 404 for an invisible/unknown note (NFR-2), with no change.

_Edit/Delete affordances live on the author's own notes in `WordNotesDialog`, so they appear wherever notes do (library, drill, inline row)._
