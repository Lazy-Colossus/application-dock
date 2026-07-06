---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
ideas_generated: 25
session_active: false
workflow_completed: true
session_topic: 'Japanese-learning app for Application Dock — starting with a vocabulary-learning tool'
session_goals: 'Define core ideas; find something original beyond standard SRS flashcards; produce a clear MVP feature set'
selected_approach: 'progressive-flow'
techniques_used: ['Cross-Pollination', 'Mind Mapping', 'SCAMPER Method', 'Resource Constraints']
ideas_generated: []
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** Your Highness
**Date:** 2026-06-10

## Session Overview

**Topic:** Japanese-learning app (new app inside Application Dock), starting with a vocabulary-learning tool, intended to grow into broader Japanese learning later.

**Goals:** Define the core ideas; come up with something original beyond standard Anki-style SRS; produce a clear starting feature set (MVP).

### Session Setup

- **Audience:** Learners who already know hiragana/katakana — kana instruction is explicitly skipped.
- **Core mechanic baseline:** Spaced-repetition flashcards (Anki-style), but actively exploring other practice modes and original ideas.
- **Content source:** Genki textbook vocabulary (sourced online) PLUS manual word entry.
- **Users:** Per-user progress tracking; begin with 2 hardcoded users, designed to expand.
- **Platform constraints (background, not limiting ideation):** self-contained app under Application Dock, JSON-on-disk persistence, Vue 3 / Quasar frontend, FastAPI backend.

## Technique Selection

**Approach:** Progressive Technique Flow (broad → focused)

**Progressive Techniques:**

- **Phase 1 — Exploration:** Cross-Pollination — steal practice mechanics from unrelated domains to find original vocab-practice modes.
- **Phase 2 — Pattern Recognition:** Mind Mapping — cluster raw ideas into themes, surface gaps and promising directions.
- **Phase 3 — Development:** SCAMPER Method — pressure-test the strongest concepts into real features.
- **Phase 4 — Action Planning:** Resource Constraints — cut to an irreducible MVP feature set, park the rest as grow-later.

**Journey Rationale:** Matches the session goals — go wide for originality, organize, develop the best, then converge on a clear v1 scope.

---

## Phase 1 — Expansive Exploration (Cross-Pollination)

_Ideas generated collaboratively (captured below as the session progresses)._

**Constraint surfaced:** App is a session-based browser app (open → use → close). No always-on / passive / background modes. Every feature must deliver value inside a discrete sit-down session.

### Domain: Spotify / music streaming

**[Music #1]: Daily Mix** ✅ liked
_Concept_: Each session auto-assembles a word set — mostly words the user is shaky on, seasoned with a few new ones — so a session feels fresh but achievable without the user having to choose what to study.
_Novelty_: Removes decision friction; blends review + new in one curated set rather than separate "decks."

**[Music #2]: Vocab Wrapped** ✅ liked
_Concept_: Periodic stats recap — words learned this month, strongest category, "nemesis word," streaks — a motivational year/month-in-review.
_Novelty_: Turns invisible SRS progress into a shareable, motivating narrative.

**[Music #3]: Ambient/passive listening** ❌ rejected — incompatible with session-based browser app.

### ⭐ CORE DESIGN VALUE (north star)

**Calm, low-pressure, cooperative — never competitive or coercive.**
- NO competition / head-to-head / leaderboards between users.
- NO streaks, no "don't break the chain," no forced-practice mechanics, no friendly challenges that pressure the user to show up.
- PREFER passive cooperation and shared experience between the two users (e.g. a shared Daily Mix, shared decks, seeing what your partner is learning).
- Implication: even motivational features (e.g. Vocab Wrapped) must be celebratory/reflective, not streak- or guilt-based.

### Domain: Strava / fitness (competitive)
❌ Rejected as a direction — rivalry/leaderboard/progressive-pressure conflicts with the core value above. Kept only as a contrast that helped surface the value.

### Domain: Collaborative playlists / shared watchlists (cooperative)

**⭐ DATA MODEL DECISION (from user):**
- **One shared master vocabulary list** for the household.
- **Each user has their own progress** (their SRS state / familiarity is private to them).
- Any user can add a word as **'shared'** (visible to all) or **'private'** (only theirs).
- Only a **few cooperative touches** on top — keep it light.

**[Coop #1]: Shared master vocab + private progress** ✅ (the data model above)
_Concept_: Words live in a common library; learning state is per-user.
_Novelty_: Shared content without shared pressure — you co-build the library but learn at your own pace, privately.

**[Coop #2]: Shared mnemonic note ("memory hack") per word** ✅ ⭐ STANDOUT IDEA
_Concept_: Each word can carry a shared note where a user writes how they personally remember it (a mnemonic, a hack, an association). Others see it and benefit.
_Novelty_: Turns the most personal, idiosyncratic part of memorization into a cooperative gift. No competition, pure mutual help. Not something Anki/Genki apps do socially.

**[Coop #3]: "Blend" Daily Mix (shared frontier)** 🔵 parked — a session built from words both users are working on. Possible later cooperative touch.

**[Coop #4]: Ambient "partner knows this" marker** 🔵 parked — soft, non-competitive awareness of partner's progress; risk of feeling like pressure, revisit carefully.

### Domain: Learning a musical instrument (practice modes)

**[Practice #1]: Multiple practice modes per word** ✅
_Concept_: A word can be practiced several ways, not just one flashcard flip — Recognition (JP→meaning), Production (meaning→produce the Japanese/reading), Context/cloze (word blanked in an example sentence). Keeps a Daily Mix varied.
_Novelty_: Same word, multiple angles → deeper retention than recognition-only; makes sessions non-monotonous.

- **Recognition** ✅ core
- **Production** ✅ wanted (active recall — the "real learning tool" fork)
- **Context / cloze** ✅ wanted, but gated by content availability (see constraint)
- **Listening** ❌ OUT OF SCOPE for now (no reliable audio source yet)

**⚠️ CONSTRAINT — content availability:**
- Vocabulary is **scraped from free, volunteer-uploaded lists online** — data may be incomplete/inconsistent (readings, example sentences, etc. not guaranteed).
- **Manual word entry must stay low-friction** — can't require the user to also supply example sentences, etc.
- Therefore some practice modes can't be guaranteed for every word from source data alone.

**[Practice #2]: AI "improve this word" augmentation** ✅ ⭐ STANDOUT IDEA
_Concept_: An opt-in AI action that enriches a word — e.g. generates example sentences, and crucially can build those sentences **from vocabulary the user already knows** (comprehensible input / i+1). Fills the gaps that scraped/manual data leaves.
_Novelty_: Solves the content-availability problem AND personalizes context to each learner's known words — example sentences you can actually read. This is the "something original" the session was hunting for.
_Open Qs_: Per-word on demand vs batch? Cache results so it's generated once and shared? Requires an LLM call (platform has Claude available) → a real dependency to scope.

**[Practice #3]: Per-user practice-mode preferences** ✅
_Concept_: Each user can tweak which practice modes are included and how often they appear in their sessions.
_Novelty_: Personalization without pressure — fits the calm/cooperative value; respects that users learn differently.

### Domain: Collection apps (Pokédex / library) — content & organization

**⭐ MVP SPINE DECISION (from user):**
- The **core of the app is "boring," reliable chapter/topic-by-chapter practice** — the dependable thing users come for.
- All the playful extras (Daily Mix, Pokédex collection, Wrapped) are **voluntary spice on top**, never required.
- **Organization model:** words are grouped by **`textbookName_chapter`** (e.g. Genki_3) **and/or custom topics** the user defines. User can go straight in and practice a chosen chapter/topic.

**[Content #1]: Chapter/topic as the core organizing unit** ✅ MVP
_Concept_: Practice is selectable by textbook-chapter or custom topic group. This is the primary navigation/study path.
_Novelty_: Not novel — deliberately so. It's the trustworthy backbone; novelty lives in the optional layers.

**[Content #2]: Pokédex-style collection view** 🔵 LATER (explicitly "implement later on")
_Concept_: Visual sense of a collection filling in — encountered-vs-learned-vs-untouched words, per chapter/shelf, as a non-pressure progress feel.
_Novelty_: Makes acquisition satisfying without streaks/scores.

**[Content #3]: "Add to my collection" deliberate add gesture** 🔵 LATER
_Concept_: Choosing which words enter your active learning is an intentional act, not a bulk dump.

### Domain: SRS scheduling re-thought (calm spacing)

**[SRS #1]: Automatic, invisible scheduling — no "due debt"** ✅ MVP (user chose "automatic")
_Concept_: Keep the spaced-repetition memory science, but never surface overdue counts or a backlog. The app always serves the most-worth-reviewing words right now, capped at a calm session size. Skip three weeks → you get today's best N, not a wall of 200.
_Novelty_: Directly removes the Anki guilt-machine UX while keeping its benefits — embodies the core calm value.

**[SRS #2]: Subtle per-word familiarity color** ✅ MVP
_Concept_: The ONE visible signal — a gentle color per word indicating how well the user knows it. Glanceable, encouraging, never a nag. No intervals/due-dates shown.
_Novelty_: Minimal, low-pressure progress feedback.

**[SRS #3]: Session-bounded, not deck-bounded** ✅ (implied) — "I have 10 minutes" gives a satisfying bounded session with a clean end; no "180 to go."

**[SRS #4]: "Good enough" forgetting** 🔵 parked — mastered words drift to the background and stop nagging; resurface rarely. A refinement of the scheduler, revisit during design.

### Domain: AI-tutor angle

**Overall stance:** AI as an **explicit "✨ improve / ask AI" button** the user presses (controls cost + latency). "Always-on quiet AI woven throughout" is a **later aspiration** — definitely something to strive for, not MVP.

**[AI #1]: AI "improve the word/dataset" — gap-filler** ✅ PRIORITY
_Concept_: On demand, AI completes patchy scraped/manual words — missing reading, part of speech, clean English gloss — so every word is "complete enough" to practice.
_Novelty_: Turns the data-quality constraint (free volunteer-scraped lists) into a non-issue.

**[AI #2]: AI mnemonic suggestion** ✅ PRIORITY
_Concept_: When no human shared-note exists, AI offers a starter mnemonic the user can keep, edit, or replace. Human notes remain the soul; AI just primes the pump.
_Novelty_: Complements the human shared-mnemonic feature without replacing its heart.

**[AI #3]: AI nuance explainer** ✅ PRIORITY
_Concept_: Tappable "explain the difference / how is this actually used?" for tricky words (e.g. near-synonyms, usage traps).
_Novelty_: Tutor-grade insight on demand, scoped to a single word.

**[AI #4]: AI forgiving grader (production mode)** ✅ wanted (pairs with Production mode)
_Concept_: In production mode, AI judges "close enough" answers (typos, kana vs kanji) as correct instead of brittle exact-string matching.
_Novelty_: Removes the #1 frustration of DIY vocab tools.

**[AI #5]: AI example sentences from known vocab (comprehensible input)** ✅ ⭐ signature idea (from Practice #2) — listed here too as part of the AI suite.

**[AI #6]: Always-on AI tutor woven throughout** 🔵 LATER aspiration.

---

## Idea Organization and Prioritization

### Thematic Organization (Phase 2 — Mind Mapping)

**Theme A — The Core Loop (the "boring," reliable spine) 🟢 MVP**
Practice by `textbook_chapter` or custom topic · multiple practice modes per word (recognition + production) · automatic invisible SRS, no "due debt" · subtle per-word familiarity color · session-bounded with a clean end.

**Theme B — Content & Data 🟢 MVP**
Shared master vocabulary list · per-user private progress · add words as shared or private · low-friction manual entry · Genki vocab imported by chapter.

**Theme C — AI Enrichment (signature differentiator) 🟠 PHASE II (architect for it now)**
AI "improve this word" gap-filler (readings/POS/gloss) · AI mnemonic suggestions · AI nuance explainer · (later) AI example sentences from known vocab (comprehensible input ⭐), forgiving grader, always-on tutor.

**Theme D — Cooperative Touches (calm, no pressure) 🟢 one in MVP**
Shared mnemonic note per word (human ⭐, MVP) · (later) Blend Daily Mix, "partner knows this" glow.

**Theme E — Voluntary Spice 🔵 Later**
Daily Mix · Vocab Wrapped · Pokédex-style collection view.

**❌ Rejected (define-by-negation — shaped the soul of the app):** competition, leaderboards, streaks, forced challenges, passive/background audio, listening mode (for now).

### Prioritization Results

**Decision:** Ship the calm core loop first. **AI enrichment (Theme C) is deferred to Phase II**, but the MVP must be **architected to accommodate it** (optional word fields AI can populate; a clear service seam for enrichment calls; the `✨ improve` affordance designed-but-stubbed).

**MVP scope (Phase I):**
- Vocab organized by `textbookName_chapter` and/or custom topics; practice a chosen chapter/topic.
- Genki vocab import (by chapter) + low-friction manual word entry.
- Shared master vocabulary list; words flagged shared vs private; per-user private progress.
- Practice modes: Recognition + Production.
- Automatic, invisible spaced-repetition scheduling (no due-counts/backlog); subtle per-word familiarity color.
- Session-bounded practice with a clean end.
- Shared mnemonic note per word (human-authored).
- 2 hardcoded users (designed to expand later).

**Phase II (next, be prepared for):**
- AI "improve word/dataset" (gap-fill), AI mnemonic suggestions, AI nuance explainer (explicit ✨ button).

**Phase III+ (later spice / aspirations):**
- AI sentences from known vocab (comprehensible input), forgiving AI grader, always-on AI tutor.
- Daily Mix, Vocab Wrapped, Pokédex collection view.
- Cooperative extras: Blend Daily Mix, partner-progress glow.
- Listening mode; broader Japanese learning (grammar, kanji); user management/expansion.

### Cross-cutting design principles (carry into PRD)
1. **Calm & cooperative, never competitive or coercive** — no streaks, leaderboards, due-debt, or forced practice.
2. **Boring-but-reliable core; playful extras are always optional.**
3. **Architect for AI from day one, ship without it.**
4. **Low-friction content in** (scraped data may be patchy; manual entry must stay easy; AI later fills gaps).
5. **Minimal visible progress signal** (one familiarity color), automatic scheduling under the hood.

## Session Summary and Insights

**Key achievements:**
- Defined a clear product soul (calm, cooperative, low-pressure Japanese vocab tool) by deciding what NOT to build as much as what to build.
- Found a signature differentiator: AI-generated comprehensible-input sentences + human/AI mnemonic notes.
- Landed a crisp, decisively-scoped MVP with Phase II/III roadmap.

**Creative breakthroughs:**
- The Strava "rivalry" prompt backfired productively — it surfaced the no-pressure core value.
- "AI builds example sentences from words you already know" = comprehensible input, the original idea the session was hunting for.
- The shared human mnemonic note: cooperation without pressure.

**Session reflections:** User was highly decisive, cutting scope as fast as generating it — convergence happened naturally alongside divergence.

