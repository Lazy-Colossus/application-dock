---
title: "Hotaru — Experience (EXPERIENCE.md)"
status: final
created: 2026-06-10
updated: 2026-06-12
sources:
  - ../../prds/prd-application-dock-2026-06-10/prd.md
  - ../../briefs/brief-application-dock-2026-06-10/brief.md
  - .decision-log.md
design_ref: ./DESIGN.md
inherits_ui_system: "Vue 3 + Quasar v2 (Material-based)"
---

# Hotaru — Experience Spine

> The how-it-works contract for Hotaru, a Japanese vocabulary app shipped as a self-contained app inside the **Application Dock** platform. This spine is the *behaviour*; `DESIGN.md` is the *visual identity* (palette, type, glow, motion tokens). Token references below use `{path.to.token}` and name the surface in `DESIGN.md` (which is being distilled in parallel — names are sensible-and-coordinated; final names lock in `DESIGN.md`). The promoted `mockups/*.html` are composition references, inline-linked at the sections they illustrate. **Spines win on conflict with mocks.**

## Foundation

- **Form factor:** mobile web only — **phone viewport**. Single-column, **full-bleed** screens (no floating-card-in-frame). No wider-screen or desktop layouts; couch and bus use are both on the phone.
- **UI system:** **Vue 3 + Quasar v2** (Material-based), inherited from the Application Dock platform. `DESIGN.md` extends Quasar tokens; this spine specifies only the behavioural delta. The sibling app (Archery Score Counter) is the Quasar precedent to match for platform consistency.
- **Lives inside the shell:** Hotaru is one app card on the Dock landing page, under its own route, following the platform's "adding a new app" conventions (FR-1). Identity, persistence, and the single HTTP boundary follow platform conventions.
- **Visual reference:** `DESIGN.md` owns the locked **forest-fireflies-c** world — warm moss green-brown twilight field, bamboo-green primary accent, beige/washi surfaces, warm firefly-amber glow, sparse drifting CSS fireflies, full-bleed layout. This document does not restate visuals; it references tokens by name.

## Information Architecture

The surface map. Single-column phone; navigation is push/pop (back arrow) plus the top-bar avatar menu. No bottom tab bar in v1 — Home is the hub.

| Surface | Reached from | Purpose | Realizes |
|---|---|---|---|
| **Who's studying?** (identity) | App open (cold), or "Switch user" from any avatar menu | Pick Dani or Jake — no auth, freely switchable | FR-2 |
| **Home** | After identity pick; back from any surface | The hub: greeting + two primary actions (Practice, Library); top-bar avatar | FR-1, FR-2 |
| **Practice picker + pre-session overview** | Home → Practice | Choose Scope (one Lesson **or** one Topic); see word count + Familiarity distribution; set Direction + Scoring Mode; start | FR-10, FR-11, FR-13, FR-14 |
| **Drill** | Picker → "Let's practice" | One Word at a time: prompt → reveal → grade, until session end | FR-12, FR-13, FR-14, FR-15, FR-16, FR-19, FR-20 |
| **Session summary / rest** | End of a bounded drill | Words met, how many remain, updated Familiarity; a clean stop | FR-17, FR-18 |
| **Library / word list** | Home → Library; back from Add/Detail | The shared Master Vocabulary List; browse by **Lesson** + **Topic** filter; Familiarity glyph per row; shared/private mark; entry to Add and Detail | FR-3, FR-5, FR-6, FR-7, FR-21 |
| **Add word** | Library → ＋ FAB | Low-friction manual entry (3 required + optional + scope toggle) | FR-4, FR-8 |
| **Word detail + notes** | Library row tap; (notes also surface mid-drill) | One Word's full record; attributed shared/private Notes; add a note | FR-22, FR-23, FR-24 |

**How they connect.** Identity gates everything once per visit; thereafter the top-bar avatar is the only switch point. Home fans out to the two journeys: **Practice** (the drill loop) and **Library** (the content loop). Practice is a self-contained modal-ish flow (picker → drill → summary → back to Home). Library is a browse surface that feeds **Add word** (create) and **Word detail** (read/annotate). Notes appear in two places — the dedicated detail surface and inline during a drill (FR-16, FR-24) — so the cooperative payoff lands wherever the Word is.

**Topics fold into the Library** as a filter group, **not** a standalone screen (decision-log IA #1). Scope selection in the picker is the only place a single Lesson/Topic becomes a Practice Session (FR-10) — there is no separate "assigned set" concept.

→ Composition references: `mockups/home.html`, `mockups/drill-and-picker.html`, `mockups/library.html`, `mockups/add-word.html`, `mockups/word-notes.html`. Spine wins on conflict.

## Voice and Tone

Microcopy rules. Brand voice and aesthetic posture live in `DESIGN.md`.

**CRITICAL PRINCIPLE — calm is the manner, not the mission.** Hotaru's job is *effective practice*; serenity is how it carries itself, not what it talks about. Voice = **warm, clear, encouraging toward getting the words to stick.** Do **not** over-index on "calm / gentle / serene / quiet" filler — that vocabulary, used as decoration, dilutes the encouragement. State the helpful thing plainly and warmly.

| Do | Don't |
|---|---|
| "Let's practice →" | "Begin a calm round →" |
| "Drill the words you're learning" | "A gentle round to soothe the mind" |
| "Worth a revisit" | "Worth a gentle revisit" |
| Grade buttons bare: **Incorrect** · **Close** · **Correct** | "Didn't land · Almost · Got it (nicely done!)" with subtext |
| "Just the essentials — you can fill in the rest later." | "Lovingly capture your serene little word 🌿" |
| "Nice — that's enough for now." (session end) | "You should keep going to maintain your streak!" |

**Hard bans (enforces §5 / FR-18 / the Calm guardrail):** no streak language, no "cards due / N overdue", no leaderboards or head-to-head comparison, no urgency or guilt ("you're falling behind"), no exclamation-mark cheerleading. Encouragement is about the *learning*, never about *returning*.

**Poetic footers** (e.g. "the fireflies will keep your place 🌙") are permitted **sparingly** as ambient mood at natural rest points (identity, session-end) — never inside the working drill where they'd compete with the task. One per surface, at most.

## Component Patterns

Behavioural. Visual specs (colour, type, glow, elevation, motion) live in `DESIGN.md`.

| Component | Use | Behavioural rules |
|---|---|---|
| **Drill flashcard** | Drill | Three-beat loop: **prompt** (one side shown, per Direction) → **reveal** (tap "Show" / tap card to flip) → **grade**. One Word at a time. The practiced Japanese word is the focal element — rendered in `{colors.lamp-yellow}` with `{components.drill-card.jp-glow}` ("a lamp glowing in the dusk"); the card carries `{components.drill-card.ambient-glow}` ambient amber so it pops off the field. See `mockups/drill-and-picker.html` (Hero). |
| **Grade buttons** | Drill (after reveal) | Exactly three, left→right **Incorrect / Close / Correct**, bare labels (no subtext). Each records a Grade (FR-15) and advances. Effect on Familiarity: **Correct ↑**, **Close ↑ less**, **Incorrect ↓** (decreases / resets toward start) (FR-20). Colours map to the familiarity ramp ends (`{colors.fam-1-new}` incorrect → `{colors.fam-4-strong}` correct) but the *label* always carries the meaning. |
| **Direction toggle** | Picker (sets session), shown as a pill on the drill | **JP→EN** (recognition: show Japanese, recall meaning) or **EN→JP** (production: show meaning, produce Japanese) (FR-13). Set per session; not persisted across sessions (v1). Current direction is shown as a small pill on the drill (`.dirpill`). |
| **Scoring mode** | Picker (sets session) | **Self-grade** (reveal, then pick a Grade) — available both directions. **Typed** (user types the kana; app compares to the reading by **exact match**, records Correct on match) — **EN→JP only** (FR-14). On a non-matching typed answer: **reveal the correct answer + fall back to self-grade** (Correct / Close / Incorrect), preserving the Close concept (FR-14 assumption). |
| **Familiarity icon** | Drill, Library rows, Word detail header, picker ramp | A **distinct glowing icon per level** — deliberately *not* category-pill chrome. 5 levels: New ○ · Learning ◔ · Familiar ◑ · Strong ◕/◉ · Mastered ● (final icon set TBD; `DESIGN.md` owns it). Always pairs **icon + colour + text label** (`{colors.fam-1-new}`–`{colors.fam-5-mastered}`) so colour is never the sole signal. Per-User, per-Word (FR-20, FR-21). |
| **Category pills + overflow** | Drill card bottom edge, Word detail header | **Tiny** pills (POS, Lesson, Topics) lined along the card's **bottom edge**. On overflow, collapse to a 🏷 + "＋N" chip with a **pure-CSS expand toggle** (checkbox-hack, no JS); expanded label swaps to "− less". Distinct from the Familiarity icon. |
| **Word row** | Library list | Japanese form + reading, English meaning, shared/private badge, Familiarity icon. Tap anywhere → Word detail. |
| **Top-bar avatar switcher** | Every post-identity surface (top-right) | Coloured initial avatar for the active User (`{components.avatar.bg-jake}` / `{components.avatar.bg-dani}`). Tap opens a menu: "Signed in as {name}", **Switch to {other}**, **Settings** (FR-2). Switching re-scopes Progress, Private Words, and Private Notes to the new User. See `mockups/home.html` (B). |
| **Shared per-word notes** | Word detail; inline mid-drill | Free-form, **attributed to the author** ("Jake:", "You:"). **Shared notes carry NO badge** — shared is the implicit default. **Only Private notes show a 🔒 lock** (icon + "Private"). Word detail always carries an inline **＋ Add note** affordance (not only in the add-note sub-state), hinting "shared by default". A Word may carry multiple notes (FR-22). A **placeholder slot for the future "✨ improve" AI action is reserved** in the word-detail layout (absent / stubbed in v1) so we architect for AI from day one (PRD §10). See `mockups/word-notes.html`. |
| **Add-note input** | Word detail | Textarea + **Shared / Private scope toggle** (Shared on by default) + "Add note". Author + scope stored (FR-22, FR-23). The note's **author can flip an existing note's visibility** (shared ↔ private) after creation (FR-23). |
| **Topic create + assign** | Library (Topic management entry); Word detail | A User can **create a named Topic** and **assign / unassign Words** to it — either from the Word detail (add/remove this Word's Topics) or via a Topic-management entry in the Library. Topics remain a Library filter group, not a standalone screen (FR-6). |
| **Add-word form** | Add word | **3 required fields** (Japanese form, reading/kana, English meaning), visually highlighted; **optional below** (part of speech, Lesson **or** Topic) must never be forced (patchy-data tolerance, FR-4); **Shared / Private scope toggle** (Shared default). Save → Word is immediately drillable, joins the list as ○ New (FR-8). See `mockups/add-word.html`. |
| **Primary action tile** | Home | Large tap target, icon + title + one-line description + arrow. Practice is the `primary` emphasis tile; Library secondary. |
| **Fireflies (ambient)** | Every surface, behind content | Sparse, slow CSS fireflies on wandering looping paths with soft glow halos. Rendered **behind** translucent content panels (z-index below the washi backdrop) so they read ~half as bright over cards, full over plain field — never distract from the task. Decorative only; not interactive. Reduced-motion fallback in Accessibility. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| **Empty — no words in scope** | Library (filtered to an empty Lesson/Topic) | "Nothing here yet." + a route to **＋ Add word**. No error chrome. |
| **Empty — no notes yet** | Word detail, Notes section | Show only the inline **＋ Add note** affordance ("shared by default"). No "no notes" scolding. |
| **Prompt (unrevealed) drill state** | Drill | One side shown per Direction; reveal control present (Self-grade) or text input present (Typed). Grade buttons hidden until reveal. |
| **Revealed drill state** | Drill | Both sides shown; practiced Japanese word lit in `{colors.lamp-yellow}` + `{components.drill-card.jp-glow}`; any shared note for this Word surfaces inline (FR-16/FR-24); the three Grade buttons appear. See `mockups/drill-and-picker.html` (Hero, revealed). |
| **Typed near-miss** | Drill (Typed, EN→JP) | Non-exact answer → reveal correct reading, then offer self-grade (Correct / Close / Incorrect) (FR-14). No harsh "wrong" framing. |
| **Aging / weak-word** | Pre-session overview; "Worth a revisit" list | Words trending down or long-rested surface gently ("resting 18 days · softening") with their Familiarity pip. **No due-count, no overdue debt** (FR-18). Spaced repetition favours weaker/due words *within the Scope* (FR-19) without exposing intervals. See `mockups/drill-and-picker.html` (State). |
| **Session end / rest** | Session summary | "Nice — that's enough for now." + words met this session + how many remain in Scope + updated Familiarity (FR-17). A clean stop; nothing nags a return; skipping days produces no penalty or backlog wall (FR-18). |
| **Private-data isolation** | Everywhere | Private Words and Private Notes are **never** rendered for the other User (FR-7, FR-24 — the one hard data-isolation rule). On user switch, the surface re-scopes; the other User's private content simply isn't present (not "hidden behind a lock screen"). |

## Interaction Primitives

- **Tap to act.** Tap a name to identify; tap a Home tile to enter; tap the drill card / "Show" to reveal; tap a Grade button to score and advance; tap a word row to open detail.
- **Reveal → grade** is the core rhythm of the drill — never grade before reveal (Self-grade); typed entry auto-scores then either advances (match) or reveals + self-grades (near-miss).
- **CSS expand toggle** — category-pill overflow expands/collapses via a pure-CSS checkbox-hack (no JS), label swapping ＋N ↔ − less.
- **User switching** — top-bar avatar → menu → "Switch to {other}" re-scopes the whole app to that User; no password, instant. Identity is also the cold-open gate.
- **Back** — back arrow pops Add word / Word detail to Library; the drill flow returns to Home at session end.
- **Banned everywhere:** streak counters, due-count badges, competitive comparison, urgency/guilt prompts, push re-engagement, infinite-scroll gamification.

## Accessibility Floor

Behavioural. Visual contrast specifics live in `DESIGN.md`.

- **Colour is never the sole signal.** Familiarity = **icon + text label + colour** on every surface it appears (drill, Library rows, detail header, picker ramp). Grade outcome carries its meaning in the **word**, not the colour. Shared/private status carries an icon (🔒) + word, not hue alone.
- **Reduced motion** — `prefers-reduced-motion: reduce` stops firefly travel and blink; fireflies become **static dim dots**. No card glow pulsing, no flip animation that conveys meaning.
- **Tap targets** — Grade buttons, Home tiles, avatar, FAB, and word rows meet a comfortable thumb target (≥ 44–48px, per Quasar/platform). The drill's three Grade buttons span the width evenly so they're reachable one-handed.
- **Legibility of Japanese glyphs** — Japanese forms render large and high-contrast against the washi panel; the practiced word is the largest, brightest element. Reading (kana) always accompanies the Japanese form. Font stack includes Japanese faces (Hiragino / Yu Gothic / Meiryo).
- **Screen reader** — interactive elements labelled with role + state; Direction and Scoring Mode announce their current setting; the avatar announces the active User.

## Key Flows

Named-protagonist flows mirroring the PRD's UJ IDs verbatim.

### UJ-1 — Jake drills Lesson 2 vocab on the couch

1. Jake opens Hotaru from the Dock; the **Who's studying?** screen shows two avatars. He taps **Jake** (`mockups/home.html` A).
2. **Home** greets him ("Evening, Jake") with two tiles. He taps **Practice** (`mockups/home.html` B).
3. **Picker:** he chooses Scope **Genki · Lesson 2**, sets **Direction = EN→JP** (produce the Japanese) and **Scoring = Self-grade**. The **pre-session overview** shows "42 words in this set" and the 5-tier Familiarity distribution (FR-11). He taps **Let's practice →** (`mockups/drill-and-picker.html`, Secondary).
4. **Drill:** cards come one at a time, weaker words favoured (FR-19). Prompt "promise" → he recalls, taps to reveal 約束 / やくそく lit in lamp-yellow → grades **Correct / Close / Incorrect** (`mockups/drill-and-picker.html`, Hero).
5. **Climax:** mid-drill he thinks of a clever sentence, taps **＋ Add note** on the current card, types his mnemonic, leaves the scope toggle on **Shared**, and posts it — without leaving the session (FR-16). The note is now a quiet gift waiting on that Word for Dani.
6. **Resolution:** the bounded session ends with **"Nice — that's enough for now"** — words met, how many remain, updated Familiarity (FR-17). He closes the app; nothing nags him to return (FR-18).

### UJ-2 — Dani adds an off-textbook word *(lighter)*

1. Dani, reading manga on the bus, hits a word she wants to keep. In Hotaru (identified as Dani) she opens **Library** → taps the **＋ Add word** FAB.
2. **Add word:** she fills the **three required fields** — Japanese form, reading, meaning — in a few taps; optionally tags it (Lesson/Topic, e.g. "Manga words") and sets the **Shared / Private** toggle (`mockups/add-word.html`).
3. **Climax:** she taps **Save word** — it "quietly joins your list as ○ New" and is **immediately drillable** like any other word (FR-8), with no optional field forced (FR-4). The textbook boundary just dissolved.

### UJ-3 — Dani discovers Jake's note *(lighter)*

1. Later, drilling the same Lesson 2 set (or browsing Library → tapping 約束), Dani lands on the Word.
2. **Word detail / drill reveal:** the Notes section shows Jake's note attributed to him — **no "shared" badge** (shared is implicit), just "Jake: yak + soku → I promise to feed the yak 🐂". Her own note below carries a **🔒 Private** lock (`mockups/word-notes.html` A).
3. **Climax:** Jake's silly mnemonic clicks for her too — the cooperative payoff (FR-24), with zero pressure or competition. She can tap **＋ Add note** to leave her own.

---

## Self-coverage check

**PRD FR areas — all homed:** F1 (FR-1, FR-2) → Foundation, IA, avatar switcher, UJ-1. F2 (FR-3 Library; FR-4/FR-8 add-word form + UJ-2; FR-5/FR-6 Lesson+Topic filters; FR-7 shared/private words + isolation; FR-9 Genki seeding — out-of-app pipeline, surfaces as preloaded Lessons in Library/picker). F3 (FR-10 picker; FR-11 overview; FR-12 flashcard; FR-13 direction; FR-14 scoring/typed near-miss; FR-15 grades; FR-16 mid-drill note; FR-17 summary; FR-18 calm bounds → Voice bans + rest state). F4 (FR-19 hidden scheduling / aging state; FR-20 familiarity model / grade effects; FR-21 familiarity display). F5 (FR-22 create note; FR-23 visibility toggle; FR-24 partner sees shared → UJ-3).

**IA surfaces — all homed:** Identity, Home, Picker+overview, Drill, Summary/rest, Library (with Topic-as-filter), Add word, Word detail+notes — each has an IA row, component coverage, and at least one state.

**UJs present:** UJ-1, UJ-2, UJ-3 — verbatim IDs, each with a climax beat and mockup references.

**Coverage gaps / notes:**
- **FR-9 Genki seeding** is an offline pipeline, explicitly out-of-app (PRD §6.2). It has no dedicated UI surface; it surfaces only as preloaded Lessons in Library/picker. Noted, not a screen.
- **Settings surface** (reached from the avatar menu) is referenced but not specified — PRD gives it no FRs beyond the menu entry; left as a stub for v1 (consistent with platform; Phase II "✨ improve" affordance, PRD §10, would live near Word detail and is intentionally absent in v1).
- **Persisted practice preferences** are explicitly out of scope (PRD §6.2) — Direction/Scoring are per-session, reflected in the Direction-toggle rule.
- **Token names** are reconciled against the locked `DESIGN.md`: `{colors.lamp-yellow}`, `{colors.bamboo}`, `{colors.fam-1-new}`–`{colors.fam-5-mastered}`, `{colors.firefly}`, the drill-card glows `{components.drill-card.ambient-glow}` / `{components.drill-card.jp-glow}`, and avatar fills `{components.avatar.bg-jake}` / `{components.avatar.bg-dani}` all resolve against `DESIGN.md`.
