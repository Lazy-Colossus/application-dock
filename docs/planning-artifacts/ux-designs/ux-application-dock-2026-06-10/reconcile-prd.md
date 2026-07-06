# Reconciliation Pass — Hotaru UX Spines vs. PRD + Brief

**Date:** 2026-06-12
**Targets (UX spines):** `DESIGN.md`, `EXPERIENCE.md`
**Sources:** PRD (`prd.md`, primary), Brief (`brief.md`, secondary)
**Scope note:** Passion/household project. Findings are right-sized — no enterprise additions recommended.

---

## Verdict

The spines are **faithful and near-complete**. Every PRD feature area (F1–F5) and every FR with a UI implication has a home in EXPERIENCE.md's IA + Component/Flow sections, and the three user journeys (UJ-1/2/3) are present verbatim with climax beats. The brief's design principles and product soul are not only present but elevated — "calm is the manner, not the mission" is treated as a CRITICAL PRINCIPLE with an enforced Do/Don't copy table.

What follows is the verification trail and a short list of genuinely-dropped or thinly-covered items. None are blocking; most are minor.

---

## (a) Every PRD FR with a UI implication → home in EXPERIENCE.md?

| FR | UI implication | Home in spines | Status |
|----|----------------|----------------|--------|
| FR-1 App in shell | App card + route to home | IA (Home row), Foundation, UJ-1 step 1 | Covered |
| FR-2 User identity | Identity screen + avatar switcher | IA (Who's studying?), Top-bar avatar component, UJ-1/2/3 | Covered |
| FR-3 Master list | Library browse | IA (Library), Word row, State (empty) | Covered |
| FR-4 Word record (3 req + optional) | Add-word form, optional-never-forced | Add-word form component, UJ-2, State | Covered |
| FR-5 Organize by Lesson | Lesson filter in Library/picker | IA (Library "browse by Lesson + Topic"), picker scope | Covered |
| FR-6 Organize by Topic | Topic filter; create Topic; assign/remove | IA ("Topics fold into Library as a filter group") | **Partial — see Gap 1** |
| FR-7 Shared/Private Words | Visibility flag + isolation | Word row badge, Private-data-isolation state | Covered |
| FR-8 Manual entry | Quick add, immediately drillable | Add-word form, UJ-2 climax | Covered |
| FR-9 Genki seeding | (offline pipeline) preloaded Lessons | Self-coverage note: out-of-app, surfaces as preloaded Lessons | Covered (correctly noted as no-UI) |
| FR-10 Activity & scope picker | Picker, one Lesson or Topic | IA (Picker), UJ-1 step 3 | Covered |
| FR-11 Pre-session overview | Word count + Familiarity distribution | IA (picker overview), UJ-1 step 3 | Covered |
| FR-12 Flashcard flow | Prompt → reveal → grade | Drill flashcard component, Interaction primitives | Covered |
| FR-13 Direction toggle | JP→EN / EN→JP | Direction toggle component, picker | Covered |
| FR-14 Scoring Mode (+typed near-miss) | Self-grade / Typed; reveal+self-grade fallback | Scoring mode component, Typed near-miss state | Covered |
| FR-15 Grade recording | 3 grade buttons | Grade buttons component | Covered |
| FR-16 Note mid-session | + Add note inside drill | Shared notes component, Revealed drill state, UJ-1 climax | Covered |
| FR-17 Session summary | Words met / remain / updated Familiarity | Session end state, UJ-1 resolution | Covered |
| FR-18 Calm bounds | No due-count, clean end | Voice hard bans, Session end state, banned-everywhere | Covered (strongly) |
| FR-19 Auto scheduling | Weaker words favoured; no intervals shown | Aging/weak-word state, Drill ("weaker words favoured") | Covered |
| FR-20 Familiarity model | 5 levels; grade effects | Familiarity icon, Grade buttons (Correct↑/Close↑less/Incorrect↓) | Covered |
| FR-21 Familiarity display | Subtle per-word colour/level | Familiarity icon on rows/overview/detail | Covered |
| FR-22 Create Note | Multiple notes, author stored | Shared notes + Add-note input components | Covered |
| FR-23 Note visibility | Shared/Private toggle, changeable by author | Add-note input (scope toggle) | **Partial — see Gap 2** |
| FR-24 Partner sees Shared | Shared visible to both; private isolated | UJ-3, Private-data-isolation state, notes component | Covered |

---

## (b) PRD user journeys present?

- **UJ-1 (Jake drills Lesson 2 on the couch):** Present verbatim with all beats — picker/scope, direction+scoring, one-at-a-time drill with weaker words favoured, mid-drill shared note (climax), calm bounded end (resolution). Faithful.
- **UJ-2 (Dani adds an off-textbook word):** Present, marked *(lighter)* matching the PRD. Captures 3 required fields, optional tag, shared/private toggle, "immediately drillable as ○ New" climax. Faithful.
- **UJ-3 (Dani discovers Jake's note):** Present, *(lighter)*. Captures shared-note-with-no-badge, private-lock, cooperative payoff with zero pressure. Faithful — even reuses the PRD's 約束 word and Jake's mnemonic spirit.

All three present, verbatim IDs, each with a climax beat. No gap.

---

## (c) Brief's design principles / product soul — reflected, not lost?

The six guiding principles (brief §"Design Principles", carried into PRD §1.1) map as follows:

1. **Effective learning is the mission** — Reflected. EXPERIENCE Voice/Tone explicitly states "Hotaru's job is *effective practice*" and the Do/Don't table steers copy toward "getting the words to stick." DESIGN brand section: "encouraging toward effective practice rather than leaning on 'calm/gentle/serene' filler." **This is the strongest save** — the structure usually loses "effective-learning-first" under the calm aesthetic, but both spines explicitly subordinate calm to learning. Well preserved.
2. **Cooperative by design** — Reflected. Shared notes as "a quiet gift," "cooperative payoff," attribution ("Jake:" / "You:"), no rivalry. UJ-1 climax and UJ-3 both land it. Well preserved.
3. **Architect for AI from day one; ship without it** — **See Gap 3.** The "✨ improve" affordance (PRD §10, brief "What Makes This Different") is *mentioned* in EXPERIENCE self-coverage as "intentionally absent in v1," but the spine does not reserve a home/placement for it. Minor, but it is the one soul-bearing future affordance the PRD asks UX to *anticipate*.
4. **Calm is the manner, not the mission** — Reflected, emphatically. Promoted to "CRITICAL PRINCIPLE" in EXPERIENCE with a full anti-filler copy table; DESIGN echoes it in brand posture and Do/Don't. Best-preserved principle.
5. **Low-friction content in / patchy-data tolerance** — Reflected. Add-word form: 3 required highlighted, "optional must never be forced," "fill in the rest later" copy. Covered.
6. **Minimal visible progress signal** — Reflected. One Familiarity ramp, scheduling invisible, no intervals/due. Covered.

**Soul / qualitative elements check (the things structure tends to lose):**

- **蛍雪 / "studying by firefly-light" etymology** — The naming rationale (firefly = the lamp you study by) is the emotional root of the whole visual metaphor. DESIGN *embodies* it (firefly layer + the practiced word as "a lamp glowing in the dusk"). **Slightly thin — see Gap 4:** the 蛍雪 study-by-firefly-light origin is never named in either spine, so a downstream builder gets the aesthetic but not the *why*. The fireflies read as ambient mood rather than as the study-lamp metaphor the brief intends. The DESIGN lamp-yellow rule ("the brightest thing… like a lamp in the dusk") is close but doesn't connect the firefly *itself* to studying.
- **"Quiet gift between two people"** — Brief's exact framing for shared notes. EXPERIENCE preserves it ("a quiet gift waiting on that Word for Dani"). Preserved.
- **"Boring core / optional spice"** — Brief's "trustworthy boring core, with optional spice." The spines correctly keep v1 to the boring-core (no spice features), but the *posture* that spice is strictly opt-in and never required is not restated — acceptable since the spice features are all out-of-scope for v1.
- **No emoji-cheerleading / no exclamation cheerleading** — Brief implies warmth without saccharine; EXPERIENCE bans "exclamation-mark cheerleading" and saccharine copy explicitly. Preserved. (Note: poetic footers like "🌙" and the playful "🐂" mnemonic are permitted sparingly — consistent, not a conflict.)
- **"Session feels complete" / "no still-180-to-go"** — Brief success criterion. EXPERIENCE session-end state nails it. Preserved.

---

## (d) Any FR with a UI need that has NO surface?

No FR is fully homeless. Two have **thin** coverage (Gaps 1 & 2 below) — the *create/edit management* verbs are weaker than the browse/consume verbs. Everything else has a surface.

---

## Gaps (material, right-sized)

### Gap 1 — Topic *creation / assignment* UI is under-specified (FR-6)
EXPERIENCE homes Topics as a **filter group** in Library (browse/select), which covers the *read* half of FR-6. But FR-6's testable consequences include "a User can create a named Topic and add/remove Words" and "a Word may belong to multiple Topics." The spines show topic *tags* on the add-word form ("Lesson **or** Topic") and as category pills, but there is no described surface/affordance for **creating a new Topic** or **adding/removing an existing Word to/from a Topic** after creation. UJ-2 mentions tagging "Manga words" at add-time only.
*Impact:* low-medium. A builder could infer "type a new topic name in the add-word tag field," but multi-topic assignment and post-hoc add/remove are unspecified.
*Right-sized fix:* one line in the Add-word/Word-detail component rules — e.g. "Topic field accepts free-entry (new) or existing Topic; Word detail allows adding/removing Topic tags." No new screen needed.

### Gap 2 — Changing a Note's visibility after creation (FR-23)
FR-23's consequence: visibility "can be set Shared or Private at creation **and changed by its author**." The spines cover setting scope *at creation* (Add-note input toggle) thoroughly, but there is no affordance described for an author to **flip an existing note** shared↔private later.
*Impact:* low. Edge affordance for two known users.
*Right-sized fix:* one line — Word-detail note rows owned by the active User expose a scope toggle (re-using the same Shared/Private control).

### Gap 3 — The "✨ improve" AI affordance is not given an anticipated placement (PRD §10, Principle 3)
PRD §10 asks UX to *anticipate* the "✨ improve" affordance ("anticipated in the UI design… may be absent or stubbed in v1"). EXPERIENCE acknowledges it exists and is "intentionally absent in v1," which is a defensible v1 stance — but the PRD/brief want the *placement reserved* so Phase II slots in without reshaping. The spine notes where it *would* live ("near Word detail") but doesn't reserve the slot in the Word-detail component spec.
*Impact:* low for v1 shipping; matters for the "architect for AI from day one" principle.
*Right-sized fix:* a one-line note in the Word-detail component reserving a future "✨ improve" slot (stubbed/hidden in v1). Avoids enterprise scope; just preserves the seam at the UI layer to match the data/service seam the PRD already requires.

### Gap 4 — The 蛍雪 "study-by-firefly-light" metaphor is embodied but never named (soul)
Both spines render the firefly/lamp aesthetic beautifully, but neither states *why* fireflies — the 蛍雪 (studying by firefly-light) origin from the brief/PRD that makes the firefly the **study lamp**, not just ambient decor. As written, a future contributor would treat fireflies as pure mood (DESIGN even says "Decorative only; not interactive") and could lose the thread that the glow *is* the act of studying.
*Impact:* low (purely qualitative / rationale preservation).
*Right-sized fix:* one sentence in DESIGN's Brand & Style tying the firefly/lamp-yellow motif to 蛍雪 — anchors the soul so the metaphor survives future edits.

---

## Non-gaps (verified, intentionally handled — do not "fix")

- **FR-9 Genki seeding** — correctly identified as an out-of-app offline pipeline (PRD §6.2); no UI surface needed. Surfaces as preloaded Lessons. Correct.
- **Settings surface** — stubbed; PRD gives it no FRs beyond the menu entry. Correct to leave as a stub.
- **Persisted practice preferences** — explicitly out of scope (PRD §6.2); per-session Direction/Scoring is correct.
- **Context/cloze, listening, grammar/kanji, Daily Mix/Wrapped/Pokédex** — all Phase III, correctly absent.
- **Token-name provisional-ness** — EXPERIENCE flags coordinated-but-provisional token names to reconcile with DESIGN at Finalize; DESIGN now defines the real tokens (`lamp-yellow`, `bamboo`, `fam-1..5`, etc.). At this finalize pass the names are largely reconciled; EXPERIENCE still uses provisional camelCase refs (`{colors.lampYellow}`, `{effects.wordGlow}`, `{colors.avatar.jake}`) while DESIGN uses kebab tokens (`lamp-yellow`, drill-card `jp-glow`, `bg-jake`). **Minor housekeeping**, not a coverage gap: align EXPERIENCE's `{path.to.token}` refs to DESIGN's final token names.

---

## Summary

Coverage is strong: all 24 FRs have surfaces, all three UJs are verbatim, and the product soul (effective-learning-first, cooperative, calm-as-manner) is preserved — calm-as-manner is preserved exceptionally well. Material gaps are four, all minor and one-line fixes: (1) Topic create/assign verbs, (2) note visibility change-after-create, (3) reserved placement for the "✨ improve" AI affordance, (4) the unnamed 蛍雪 firefly-as-study-lamp rationale. Plus one housekeeping item: align EXPERIENCE's provisional token refs to DESIGN's final token names.
