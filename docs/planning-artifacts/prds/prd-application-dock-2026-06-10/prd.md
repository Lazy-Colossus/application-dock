---
title: "Hotaru — Japanese Vocabulary"
status: final
created: 2026-06-10
updated: 2026-06-10
---

# PRD: Hotaru — Japanese Vocabulary

## 0. Document Purpose

This PRD specifies **Hotaru**, a Japanese vocabulary-learning app shipped as a new self-contained app inside the existing **Application Dock** platform. It is written for the builder (and any downstream UX / architecture / story work). It builds on two inputs and does not duplicate them: the product brief (`docs/planning-artifacts/briefs/brief-application-dock-2026-06-10/brief.md`, status: ready) and the brainstorming session (`docs/brainstorming/brainstorming-session-2026-06-10-0041.md`). Structure: Glossary-anchored vocabulary, features grouped with globally-numbered FRs nested under them, assumptions tagged inline as `[ASSUMPTION]` and indexed in §9. Technology choices are deliberately excluded — they belong in architecture/addendum; this PRD states capabilities.

## 1. Vision

Hotaru is the memorize-it-yourself companion to Dani and Jake's shared Genki study. They learn *together* — reading aloud, discussing grammar, quizzing each other — but they drill vocabulary *alone*, and Hotaru is where that drilling lives. Before each lesson they agree on a set of words; Hotaru turns that set into effective, low-friction practice they can do on the couch or the bus.

A word is drilled Anki-style, but on the learner's terms: in either direction (see the Japanese and recall the meaning, or see the meaning and produce the Japanese), and scored either by honest self-assessment or by typing the answer. Each word carries a quiet sense of how well it's known, and spaced repetition decides what to show next — without ever nagging with overdue counts.

Because Dani and Jake are curious learners who won't be boxed in by the textbook, Hotaru lets them add their own words and — crucially — leave each other **shared notes**: the sentences, tricks, and connections that make a word finally stick. v1 earns its place purely as the best place to drill; it is architected to grow smarter later (AI explanations, example sentences, and the "big picture" connections between words), but ships without that layer.

The name **Hotaru** (蛍, "firefly") evokes 蛍雪 — studying by firefly-light — and sets the intended feel: calm, gentle, unhurried.

### 1.1 Guiding Principles

Carried from the product brief; these constrain every downstream decision (UX, architecture, stories):

1. **Effective learning is the mission** — multiple practice angles and active recall; over time, the right example/structure/mnemonic at the moment it helps.
2. **Cooperative by design** — two Users co-build the library and pool memory aids; never competitive.
3. **Architect for AI from day one; ship without it.**
4. **Calm is the manner, not the mission** — no streaks, leaderboards, due-debt, or forced practice; sustainable practice is what compounds.
5. **Low-friction content in** — source data may be patchy; manual entry stays easy; AI later fills gaps.
6. **Minimal visible progress signal** — one Familiarity colour; scheduling stays automatic and invisible.

## 2. Target User

### 2.1 Jobs To Be Done

- **Memorize an agreed set of vocabulary** between shared study lessons, efficiently and on the go.
- **Practise on my own terms** — choose direction and scoring style to match how I want to be tested today.
- **Capture and share what makes a word stick** — a sentence, a mnemonic, a connection — with my study partner.
- **Go beyond the textbook** — add words I encounter in the wild and learn them the same way.
- **Know where I stand** — see at a glance which words are solid and which need work, without pressure.

### 2.2 Non-Users (v1)

- Absolute beginners who don't yet know hiragana/katakana (kana instruction is out of scope).
- Solo learners needing a polished public product (v1 targets two known, technical users).
- Anyone needing grammar or kanji *practice* (Phase III), or audio/listening practice (deferred).

### 2.3 Key User Journeys

- **UJ-1. Jake drills Lesson 2 vocab on the couch.**
  - **Persona + context:** Jake, mid-Genki, half-attentive in front of the TV, wants a quick effective drill of the words he and Dani agreed on.
  - **Entry state:** opens Hotaru in the browser; identified as Jake (not Dani).
  - **Path:** (1) lands on a *what do you want to do* picker, chooses **word drill** scoped to **Lesson 2**; (2) sees a pre-session overview — how many words and how well he knows each; (3) starts an Anki-style flashcard flow, one word at a time, in his preferred **direction** (e.g. English → produce the Japanese) and **scoring mode** (self-grade, or type the kana); (4) grades each card **Correct / Close / Incorrect** (or types and is auto-scored).
  - **Climax:** mid-drill he thinks of a clever sentence, attaches it to the word as a **note**, and marks it **shared with Dani**.
  - **Resolution:** end-of-session summary — words practised, how many remain, updated familiarity. He closes the app; nothing nags him to return.

- **UJ-2. Dani adds an off-textbook word.** *(lighter)*
  Dani, reading a manga on the bus, hits a word she wants to keep. She opens Hotaru, adds the word with its reading and meaning in a few taps, tags it to a **topic** ("manga words") or leaves it loose, and chooses whether it's **shared** with Jake or **private**. It immediately becomes drillable like any other word.

- **UJ-3. Dani discovers Jake's note.** *(lighter)*
  Drilling the same Lesson 2 set later, Dani reaches 約束 and sees the **shared note** Jake left — his silly mnemonic. It clicks for her too. The cooperative payoff with zero pressure or competition.

## 3. Glossary

*Downstream work must use these terms exactly. No synonyms elsewhere in the PRD.*

- **User** — One of two hardcoded people (Dani, Jake). Has private **Progress**. v1 has no accounts/passwords.
- **Word** — A vocabulary entry in the **Master Vocabulary List**: a Japanese form, a reading (kana), an English meaning, and optional metadata. Tagged to at most one **Lesson** and any number of **Topics**. Flagged **Shared** or **Private**.
- **Master Vocabulary List** — The single collection of all Words, shared across both Users.
- **Shared Word / Private Word** — Visibility flag on a Word. A Private Word is visible and drillable only to the User who created it; a Shared Word is available to both.
- **Textbook** — A named vocabulary source (e.g. Genki).
- **Lesson** — A Textbook + chapter grouping of Words (e.g. `Genki` Lesson 2), where *chapter* is the Textbook's own numbered unit. The canonical organising unit.
- **Topic** — A User-defined grouping of Words (e.g. "manga words"), shared across both Users like the Master Vocabulary List. A Word may belong to many Topics.
- **Scope** — A selectable set of Words for a session: one Lesson or one Topic.
- **Practice Session** — One sitting drilling a chosen Scope.
- **Direction** — The form a card is tested in: **JP→EN** (recognition) or **EN→JP** (production).
- **Scoring Mode** — How a card is graded: **Self-grade** (reveal, then choose a Grade) or **Typed** (User types the answer; the app scores it). Typed applies only in EN→JP.
- **Grade** — The outcome recorded for a card: **Correct**, **Close**, or **Incorrect**.
- **Familiarity** — A per-User, per-Word measure of how well that User knows that Word. Surfaced as a subtle colour/level. Driven by Grades via spaced repetition.
- **Progress** — A User's Familiarity state across all Words they can see.
- **Note** — Free-form text a User attaches to a Word (a tip, sentence, mnemonic, connection). Authored by a User; flagged Shared or Private.

## 4. Features

### 4.1 App Integration & User Identity (F1)

**Description:** Hotaru appears as a card on the Application Dock landing page and lives under its own route, following the platform's "adding a new app" conventions. On entering, the current person identifies as Dani or Jake (no authentication); all Progress, Private Words, and Private Notes are scoped to the active User. `[ASSUMPTION: user selection mirrors the platform's existing hardcoded-user pattern — pick a name on entry, freely switchable, no passwords.]`

**Functional Requirements:**

#### FR-1: App registered in the shell
The platform shell can present Hotaru as a launchable app.
**Consequences (testable):**
- A Hotaru app card renders on the landing page with a label and icon.
- Selecting it routes to Hotaru's home screen.

#### FR-2: User identity selection
A person can identify as one of the two Users and switch at will.
**Consequences (testable):**
- On entry (or via an explicit switch), the active User is selectable from the two hardcoded Users.
- Progress, Private Words, and Private Notes shown reflect only the active User.
- No password or account creation is required.

### 4.2 Vocabulary Library & Organization (F2)

**Description:** All Words live in one shared **Master Vocabulary List**. Each Word has a Japanese form, a reading, and an English meaning, plus optional metadata; it is tagged to at most one Lesson and any number of Topics, and flagged Shared or Private. Words enter two ways: a preloaded Genki dataset (imported by Lesson) and low-friction manual entry (realizes UJ-2). Private Words are visible only to their creator.

**Functional Requirements:**

#### FR-3: Master Vocabulary List
The system maintains a single shared list of all Words.
**Consequences (testable):**
- A Word created by either User appears in the one Master Vocabulary List (subject to Shared/Private visibility).

#### FR-4: Word record
A Word stores the fields needed to drill and identify it.
**Consequences (testable):**
- Required on create: Japanese form, reading (kana), English meaning.
- Optional: part of speech, Lesson tag, Topic tags, creator, Shared/Private flag.
- `[ASSUMPTION: optional AI-enrichment fields (example sentence, structure breakdown, nuance, suggested mnemonic) exist on the record but are unused/empty in v1 — see §10.]`

#### FR-5: Organize by Lesson
A User can browse and select Words by Textbook + Lesson.
**Consequences (testable):**
- Each Word may carry one Lesson tag (Textbook + chapter).
- Words can be listed/filtered by Lesson.

#### FR-6: Organize by Topic
A User can create Topics and assign Words to them.
**Consequences (testable):**
- A User can create a named Topic and add/remove Words.
- A Word may belong to multiple Topics.
- Topics are shared: a Topic created by one User is visible to both (Private Words within it still follow FR-7 visibility).

#### FR-7: Shared vs Private Words
A User can mark a Word Shared or Private.
**Consequences (testable):**
- A Private Word is visible and drillable only to its creator.
- A Shared Word is visible and drillable to both Users.
- Each User's Familiarity on a Shared Word is independent.

#### FR-8: Manual word entry
A User can add a Word quickly. Realizes UJ-2.
**Consequences (testable):**
- A Word can be created by supplying only the three required fields.
- The new Word is immediately drillable.

#### FR-9: Genki vocabulary seeding
The Master Vocabulary List can be seeded with a pre-assembled Genki dataset organised by Lesson.
**Consequences (testable):**
- Genki Words load tagged to their Lesson.
- The app consumes an already-prepared dataset; it does not source or scrape vocabulary itself.
- Patchy/missing *optional* fields are acceptable (later AI-fillable).

**Notes:** The dataset is produced by an **offline preprocessing step, outside the application** — step one of the overall project: pull Genki vocabulary from a known public GitHub repository, then process it "in the back" into the seed dataset. This pipeline is **not** application functionality and is out of scope for the app itself (see §6.2).

### 4.3 Practice Session (F3)

**Description:** The core loop. From a *what do you want to do* picker, a User chooses **word drill** and a **Scope** (one Lesson or one Topic), sees a pre-session overview, then drills the Scope one card at a time in an Anki-style flow — in their chosen Direction and Scoring Mode — until a bounded session ends with a summary. Realizes UJ-1.

**Functional Requirements:**

#### FR-10: Activity & scope picker
A User can choose what to practise and over which Scope.
**Consequences (testable):**
- The picker offers **word drill** as the v1 activity.
- The User selects exactly one Scope: a Lesson or a Topic.

#### FR-11: Pre-session overview
Before starting, a User sees the size and Familiarity of the chosen Scope.
**Consequences (testable):**
- The overview shows the Word count in Scope.
- The overview conveys per-Word (or distribution of) Familiarity for the active User.

#### FR-12: Flashcard flow
A User drills the Scope one Word at a time, revealing the answer then grading.
**Consequences (testable):**
- Cards present one Word at a time with the prompt side shown first.
- The User can reveal the answer side, then record a Grade, then advance.

#### FR-13: Direction toggle
A User can choose the test Direction for the session.
**Consequences (testable):**
- JP→EN shows the Japanese and asks for the meaning.
- EN→JP shows the meaning and asks for the Japanese.

#### FR-14: Scoring Mode
A User can choose how cards are scored.
**Consequences (testable):**
- **Self-grade:** after revealing, the User selects a Grade (Correct / Close / Incorrect).
- **Typed:** (EN→JP only) the User types the kana; the app compares to the reading by **exact match** and records Correct on match.
- `[ASSUMPTION: on a non-matching Typed answer, the app reveals the correct answer and lets the User self-grade (Correct / Close / Incorrect), preserving the Close concept. Forgiving fuzzy matching is Phase III.]`

#### FR-15: Grade recording
Each card's Grade updates the active User's Familiarity for that Word.
**Consequences (testable):**
- A Grade of Correct, Close, or Incorrect is recorded per card.
- The Grade feeds the Familiarity/scheduling model (see §4.4).

#### FR-16: Attach a note mid-session
During a drill, a User can attach a Note to the current Word. Realizes UJ-1.
**Consequences (testable):**
- The User can add a Note without leaving the session.
- The Note can be flagged Shared or Private at creation (see §4.5).

#### FR-17: Session summary
A bounded session ends with a summary.
**Consequences (testable):**
- The summary shows words practised this session and how many remain in Scope.
- Updated Familiarity is reflected.

#### FR-18: Calm session bounds
Sessions are session-bounded with a clean end; no overdue debt is surfaced.
**Consequences (testable):**
- No "cards due" backlog count is shown anywhere.
- A session has a clear start and a clear end state; skipping days produces no penalty or backlog wall.

### 4.4 Spaced Repetition & Familiarity (F4)

**Description:** Spaced repetition runs quietly under the hood, choosing what's most worth showing within the chosen Scope and updating each User's Familiarity from their Grades. The only visible signal is a subtle Familiarity colour — encouraging at a glance, never a scolding number.

**Functional Requirements:**

#### FR-19: Automatic scheduling
The system orders/selects Words to drill within a Scope using a spaced-repetition model, without surfacing scheduling internals.
**Consequences (testable):**
- Within a Scope, weaker (lower-Familiarity / due) Words are favoured over well-known ones.
- No intervals, due dates, or due counts are shown to the User.
- `[ASSUMPTION: the specific algorithm (e.g. a Leitner/SM-2-family scheme) is an architecture decision; this PRD requires only the behaviour above.]`

#### FR-20: Familiarity model
Grades move a Word's per-User Familiarity.
**Consequences (testable):**
- Correct increases Familiarity; Close increases it less; Incorrect decreases it (or resets toward the start).
- Familiarity is per-User and per-Word.
- Familiarity is presented as **5 discrete levels/colours** (e.g. new → learning → familiar → strong → mastered).

#### FR-21: Familiarity display
Familiarity is shown as a subtle per-Word colour.
**Consequences (testable):**
- Word lists and the pre-session overview convey Familiarity via colour/level for the active User.

### 4.5 Shared Per-Word Notes (F5)

**Description:** The cooperative heart. Any User can attach free-form Notes to a Word — a tip, a sentence, a mnemonic, a connection between words — and choose to share each with their partner or keep it private. Shared Notes appear for both Users on that Word (realizes UJ-3); private ones stay with their author. No competition, no obligation — just mutual help.

**Functional Requirements:**

#### FR-22: Create a Note
A User can attach a free-form Note to any Word they can see.
**Consequences (testable):**
- A Note stores its text and its author (User).
- A Word may carry multiple Notes. `[ASSUMPTION: multiple Notes per Word allowed, not a single overwrite field.]`

#### FR-23: Note visibility
A User can flag each Note Shared or Private.
**Consequences (testable):**
- A Note can be set Shared or Private at creation and changed by its author.

#### FR-24: Partner sees Shared Notes
Shared Notes are visible to both Users; Private Notes only to their author. Realizes UJ-3.
**Consequences (testable):**
- A Shared Note authored by one User is visible to the other on that Word.
- Shared Notes on a Word are visible during a Practice Session when that Word is drilled (realizes UJ-3).
- A Private Note is never visible to the other User.

## 5. Non-Goals (Explicit)

- **No competitive or coercive mechanics, ever** — no streaks, leaderboards, head-to-head, challenges, or "cards due" debt. This is a permanent product stance, not a deferral.
- **No listening/audio practice** in v1 (no reliable free audio source yet).
- **No AI behaviour** in v1 — all AI enrichment is Phase II/III (see §10).
- **No grammar or kanji *practice*** modes (Phase III); v1 is vocabulary only.
- **No user self-management** — exactly two hardcoded Users; no signup, roles, or expansion in v1.
- **No always-on / background mode** — Hotaru is a discrete open-use-close session app.

## 6. MVP Scope

### 6.1 In Scope
- App registered in the Application Dock shell; two hardcoded Users with separate Progress (F1).
- Shared Master Vocabulary List; Word records; Shared/Private Words; Lesson + Topic organisation; manual entry; Genki dataset import (F2).
- Word-drill Practice Session: picker → Scope → pre-session overview → Anki flow; Direction toggle; Self-grade and Typed scoring; 3-level Grades; session summary; calm bounds (F3).
- Automatic spaced repetition; per-User Familiarity with subtle colour (F4).
- Shared/Private per-Word Notes (F5).
- AI-readiness: optional enrichment fields on the Word record + a service seam where Phase II AI will plug in (§10).

### 6.2 Out of Scope for MVP
- All AI features — gap-fill, mnemonic suggestion, word-structure analysis, nuance explainer (→ Phase II); example sentences from known vocabulary, forgiving fuzzy grader (→ Phase III).
- Listening mode, grammar/kanji practice, more nuanced categorisation (→ Phase III). `[NOTE FOR PM: the "big picture" connection feature Dani & Jake asked for — e.g. shared kanji components across words — is emotionally load-bearing; revisit early in Phase II.]`
- **Context/cloze practice mode** (a Word blanked in an example sentence) — a wanted third practice angle, gated on example-sentence content (→ Phase III, alongside AI-generated sentences).
- **Persisted per-User practice preferences** — v1 sets Direction/Scoring Mode per session; remembering them across sessions is deferred.
- Sentence/grammar drilling activities in the picker (→ later).
- Delight extras: Daily Mix, Vocab Wrapped, Pokédex-style collection view (→ Phase III).
- User expansion / accounts.
- **Dataset assembly pipeline** — sourcing Genki vocab from a public GitHub repo and processing it into the seed dataset is an offline preprocessing step done before/outside the app (project step one); not application functionality.

## 7. Success Metrics

Right-sized to a passion project — signals, not KPIs.

**Primary**
- **SM-1: It sticks and it's used.** Dani and Jake voluntarily drill across multiple weeks without abandoning, and Familiarity for drilled Words trends upward over time. Validates FR-12, FR-15, FR-19, FR-20.

**Secondary**
- **SM-2: The cooperative layer is real.** Shared Notes get written and read by both Users, and at least sometimes help recall. Validates FR-22, FR-24.
- **SM-3: The library grows past the textbook.** Off-textbook Words are added and drilled. Validates FR-8.

**Counter-metrics (do not optimize)**
- **SM-C1: Don't manufacture engagement.** Return visits must come from wanting to learn, not from pressure features. If we ever feel tempted to add a streak or a "due" nag to lift SM-1, we've failed. Counterbalances SM-1.

## 8. Open Questions

None outstanding.

*Resolved during drafting: scope selection suffices for "agreed vocab" (no assigned-set concept); Familiarity = 5 tiers; Typed near-miss reveals + self-grades; Genki data comes from a public GitHub repo via an offline pipeline outside the app; Topics are shared across both Users.*

## 9. Assumptions Index

- §4.1 / FR-2 — User selection mirrors the platform's existing hardcoded-user pattern (pick a name, no passwords).
- FR-4 — Optional AI-enrichment fields exist on the Word record but are empty/unused in v1.
- FR-14 — Non-matching Typed answers reveal the answer and fall back to self-grade (Correct/Close/Incorrect). *(Confirmed by user.)*
- FR-19 — Specific SRS algorithm is an architecture decision; PRD requires only the behaviour.
- FR-22 — Multiple Notes allowed per Word (not a single overwrite field).

## 10. Phase II AI Readiness (architect-for-AI, ship-without-it)

Not a v1 user feature — a constraint on v1 design so Phase II AI slots in cleanly:

- **Data:** the Word record carries optional, initially-empty fields for AI-generated content (example sentence(s), word-structure breakdown, nuance note, suggested mnemonic) — see FR-4.
- **Seam:** vocabulary enrichment is reached through a clear service boundary (consistent with the platform's layered backend) so a Phase II enrichment call can be added without reshaping the data flow.
- **Affordance:** an explicit user-triggered "✨ improve" action is anticipated in the UI design (may be absent or stubbed in v1), keeping AI cost/latency under explicit user control when it arrives.

## 11. Cross-Cutting NFRs & Constraints

- **Platform conformance:** Hotaru follows Application Dock conventions — self-contained app directory, the single HTTP boundary, layered backend, and JSON-file persistence (no database). Detailed tech in architecture/addendum.
- **Privacy between Users:** Private Words and Private Notes must never be visible to the other User (FR-7, FR-24) — the one hard data-isolation rule in an otherwise shared app.
- **Performance:** comfortably handles a two-person, single-textbook-scale library; no scale targets beyond "snappy on a couch/bus session."
- **Calm guardrail:** no UI surface may introduce streaks, due-counts, or competitive comparison (enforces §5 and FR-18).
- **Patchy-data tolerance:** because seed data is assembled from volunteer sources, only the three core Word fields are required; UX and validation must not force optional fields (readings beyond kana, example sentences, etc.) to be present. Gaps are expected and later AI-fillable (supports FR-4, FR-8, FR-9).
