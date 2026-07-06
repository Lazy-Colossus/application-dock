---
title: "Input Reconciliation — Hotaru PRD"
status: review
created: 2026-06-10
sources:
  - briefs/brief-application-dock-2026-06-10/brief.md (primary)
  - brainstorming/brainstorming-session-2026-06-10-0041.md (supporting)
target: prds/prd-application-dock-2026-06-10/prd.md
---

# Input Reconciliation — Hotaru PRD

**Verdict:** The PRD is a faithful, right-sized carry-forward of both inputs. The core
loop, data model, cooperative notes, calm stance, AI-readiness, and explicit non-goals all
made it across with good fidelity — and several qualitative ideas were preserved *better*
than a typical FR pass would manage (the calm guardrail as an NFR, the "emotionally
load-bearing" note-to-PM about big-picture connections, the SM-C1 counter-metric). What
follows is a small set of genuine gaps, each judged on whether the omission actually matters
for a two-person passion project.

---

## Gap 1 — The name's meaning / "product soul" is dropped (cosmetic, but it IS the soul)

**What's missing:** The PRD never explains *why the app is called Hotaru*. The brief opens
with it as the very first line, framing the entire emotional register of the product.

**Source (brief, top matter):**
> "**Name:** Hotaru (蛍, "firefly") — evoking 蛍雪, the classic image of studying by
> firefly-light. Chosen for its calm, gentle, bookish feel that matches the product's soul."

**Where it should appear:** A single line under §1 Vision (or §0). This is the one explicit
statement of the *feel* the brief wanted the product to evoke — "calm, gentle, bookish" — and
it's exactly the kind of qualitative anchor an FR structure silently loses. The PRD captures
"calm" as a *guardrail* (negative: no streaks) but never the *positive* aesthetic the name
encodes. **Recommendation:** carry the one-line etymology into §1. Low effort, preserves soul.

---

## Gap 2 — Context/cloze as the *third* practice angle, and the "more than one angle" bet

**What's missing:** Both inputs frame the core retention bet as practising each word from
*multiple* angles, and name **three** modes: Recognition, Production, **Context/cloze**. The
PRD reduces "angle" to **Direction** (JP↔EN) + **Scoring Mode**, which is a faithful read of
v1 *capability*, but Context/cloze has vanished even from the deferral list.

**Source (brainstorm, [Practice #1]):**
> "A word can be practiced several ways... Recognition (JP→meaning), Production
> (meaning→produce the Japanese/reading), **Context/cloze (word blanked in an example
> sentence)**... Context / cloze ✅ wanted, but gated by content availability."

**Where it should appear:** §6.2 Out of Scope already lists "example sentences from known
vocabulary (→ Phase III)" and Phase II AI — cloze is the natural drill mode that rides on
those sentences, so its deferral is *implied* but never stated. **Recommendation:** add a
half-line to §6.2 noting "context/cloze drilling (depends on example sentences → Phase III)."
Omitting it entirely is the only real loss; the deferral itself is correct.

---

## Gap 3 — Per-user practice-mode preferences (personalization without pressure)

**What's missing:** The brainstorm marked [Practice #3] as an accepted (✅) idea: each user
can tune which modes appear and how often. The PRD lets a user pick Direction and Scoring
Mode *per session*, but there is no notion of a *persisted per-user preference*.

**Source (brainstorm, [Practice #3]):**
> "Per-user practice-mode preferences ✅ ... Each user can tweak which practice modes are
> included and how often they appear in their sessions. *Novelty*: Personalization without
> pressure — fits the calm/cooperative value; respects that users learn differently."

**Where it should appear:** This is a borderline gap. It was ✅ in brainstorm but the brief
already quietly dropped it (the brief's scope lists only "Recognition and Production" as
modes, no preference layer), so the PRD is faithful to its *primary* input. For a two-person
v1 where per-session choice already covers the need, **the omission is fine** — but worth a
one-line `[ASSUMPTION]` or a Phase III bullet so the decision is visible rather than silently
lost. Flag, don't pad.

---

## Gap 4 — "Source data is patchy" framed as a live design constraint, not just a defer

**What's missing:** A *load-bearing* design principle in both inputs is that source
vocabulary is incomplete/inconsistent and the app must tolerate that *today* — it's why
manual entry must stay low-friction and why optional fields can be empty. The PRD preserves
the consequences (FR-8 quick entry, FR-9 "patchy optional fields acceptable", FR-4 optional
fields) but never states the *principle* that explains them, and it slightly reframes the
data source: the brief/brainstorm say "scraped from free, volunteer-uploaded lists," whereas
the PRD says "a pre-assembled Genki dataset... from a known public GitHub repository."

**Source (brainstorm, ⚠️ CONSTRAINT):**
> "Vocabulary is **scraped from free, volunteer-uploaded lists online** — data may be
> incomplete/inconsistent... **Manual word entry must stay low-friction** — can't require the
> user to also supply example sentences."

**Source (brief, Design Principle 5):**
> "**Low-friction content in.** Source data may be patchy; manual entry stays easy; AI later
> fills gaps."

**Where it should appear:** The *reframing* (scraped lists → curated GitHub repo via offline
pipeline) is an intentional, reasonable resolution (see §8 Resolved) and is fine. But the
brief's Design Principle 5 — "source data may be patchy" as a standing rationale — is the
*why* behind FR-4/FR-8/FR-9 and isn't stated anywhere in the PRD. **Recommendation:** add it
to §11 Cross-Cutting NFRs as a one-line principle ("tolerate patchy/partial Word data;
never block drilling on missing optional fields"), so downstream UX/architecture doesn't
re-introduce required-field friction. Minor but genuinely load-bearing.

---

## Gap 5 — The brief's six explicit "Design Principles (north star)" aren't carried as a set

**What's missing:** The brief ends with a numbered **"Design Principles (north star — carry
into PRD)"** block (6 principles) and the brainstorm with its own 5. These were explicitly
flagged *to carry into the PRD*. The PRD embodies most of them in scattered FRs/NFRs/non-goals
but never lands them as a single, citable north-star list. Principle 1's positive framing in
particular — *"Effective learning is the mission"* / "calm is the **manner, not the mission**"
— is the brief's central thesis-correction and is only partially audible in the PRD.

**Source (brief, Design Principles 1 & 4):**
> "1. **Effective learning is the mission.** Multiple practice angles, active recall...
>  4. **Calm is the manner, not the mission.** ... A supporting value, not the defining one."

**Where it should appear:** The PRD's §1 Vision and SM-1 do carry "effective learning is the
headline" well, and §5/§11 carry "calm." So the *intent* survives. The gap is that the
explicit instruction "carry these principles in" produced no consolidated principles section —
a reader must reverse-engineer the north star from the FRs. **Recommendation (optional):** a
short §1.x "Design Principles" list restating the 6, since both source authors explicitly
asked for it. Omission is *tolerable* (the content is present, just diffuse) — flag, not block.

---

## Things checked and confirmed carried (no action)

- Core loop: picker → scope → overview → Anki flow → summary → calm bounds (FR-10–18). ✔
- Recognition + Production as the retention bet (FR-13, vision §1). ✔
- Shared master list + per-user private progress + shared/private words (FR-3, FR-7). ✔
- Shared per-word notes as "the cooperative heart" (§4.5, FR-22–24, UJ-3). ✔ — soul preserved.
- Calm/no-coercion as a **permanent principle, not a deferral** (§5, SM-C1, §11 guardrail). ✔
- Architect-for-AI / ship-without-it, ✨ improve affordance, service seam (§10, FR-4). ✔
- Genki import + low-friction manual entry (FR-8, FR-9). ✔
- 2 hardcoded users, no accounts (FR-2, §5). ✔
- Deferred spice (Daily Mix, Vocab Wrapped, Pokédex) correctly parked (§6.2). ✔
- "Big picture / shared kanji components" connection — preserved as an explicit
  emotionally-load-bearing NOTE FOR PM in §6.2. ✔ — strong save.
- Comprehensible-input AI sentences (the brainstorm's signature idea) deferred to Phase III
  but explicitly named (§6.2). ✔
