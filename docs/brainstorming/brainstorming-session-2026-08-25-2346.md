---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - docs/planning-artifacts/prds/prd-application-dock-2026-06-10/prd.md
  - docs/planning-artifacts/ux-designs/ux-application-dock-2026-06-10/EXPERIENCE.md
  - docs/planning-artifacts/ux-designs/ux-application-dock-2026-06-10/.decision-log.md
session_topic: 'What settings does Hotaru actually need? (inventory framing)'
session_goals: 'Decide whether a Hotaru-specific Settings screen deserves to exist at all'
selected_approach: 'ai-recommended (simplified to a single technique at user request)'
techniques_used: ['Assumption Reversal']
ideas_generated: 16
verdict: 'BUILD IT SMALL — one item: reset the active user''s familiarity progress'
---

# Brainstorming Session Results

**Facilitator:** Your Highness
**Date:** 2026-08-25


## Session Overview

**Topic:** What settings does Hotaru actually need? (inventory framing)
**Goals:** Decide whether a Hotaru-specific Settings screen deserves to exist at all

### Context Guidance

Hotaru's avatar menu carries a **Settings** entry (FR-2) that is currently a dead
control — `AvatarSwitcher.vue:69` is an empty function with a stale comment. The
spine never specified the screen: `EXPERIENCE.md:155` records it as "referenced
but not specified — PRD gives it no FRs beyond the menu entry; left as a stub for
v1." This session decides whether to build it, fold it, or point it at the shell.

**Binding guardrails any candidate must clear:**
- **SM-C1 (PRD §7)** — don't manufacture engagement. No streaks, no "due" nags.
- **No-debt-wall rule (decision log, 2026-08-14)** — session state must never
  escape its screen and become a persistent obligation.
- **CLAUDE.md YAGNI / no dead code.**

### Session Setup

**Approach:** AI-Recommended, then simplified at user request from a three-phase
sequence (Morphological Analysis → Anti-Solution → Assumption Reversal) down to a
**single technique**.

## Technique Selection

**Approach:** AI-Recommended Techniques (simplified)
**Technique:** **Assumption Reversal** (`deep`)

Challenge and flip the core assumption — *"Hotaru needs its own Settings screen"*.

**Method:** list the plausible settings drawn from what is actually hardcoded or
explicitly deferred in the codebase; for each, ask the single question **"where
else could this live?"** (Practice setup · shell Settings · nowhere · here).
Whatever has no other home is the case for the screen.

**AI Rationale:** the goal is a verdict, not a feature list. Assumption Reversal
targets the existence question head-on, and the per-item "where else?" test
produces the verdict as a by-product of the inventory rather than requiring a
separate narrowing phase.

## Technique Execution — Assumption Reversal

**Assumption on trial:** *"Hotaru needs its own Settings screen."*

**Method:** enumerate plausible settings drawn from what is actually hardcoded or
explicitly deferred in the codebase, then apply one test to each — **"where else
could this live?"** Anything with another home is not evidence for the screen.

### The inventory (16 candidates)

| # | Candidate | Grounded in | Where else could it live? | Survives? |
|---|---|---|---|---|
| 1 | Direction default (JP→EN / EN→JP) | `PracticeSetupPage.vue:313` hardcodes `r2m`; PRD §6.2 defers persisting | Practice setup — control already there | ✗ |
| 2 | Scoring default (self / typed) | `PracticeSetupPage.vue:314` hardcodes `self`; same deferral | Practice setup | ✗ |
| 3 | Quick Practice preset default | `quickPreset = ref("new")` | Practice setup | ✗ |
| 4 | Session size / word limit | `limit` already in `useHotaruPracticeStore` | Practice setup | ✗ |
| 5 | Motion — fireflies on/off | `prefers-reduced-motion` honoured in 6 files; no in-app override | Nowhere else | ~ (thin) |
| 6 | Japanese display font | `DESIGN.md` TBD | Nowhere — a *design decision*, not a user setting | ✗ |
| 7 | Familiarity icon set | `DESIGN.md` TBD (placeholder ○◔◑◕●) | Nowhere — same | ✗ |
| 8 | **Reset progress** | Not implemented | **Nowhere else** | **✓ SURVIVES** |
| 9 | Clear persisted identity | `localStorage["hotaru.activeUser"]` | "Who's studying?" — already in this menu | ✗ |
| 10 | Manage household users | `_USERS` hardcoded at `hotaru.py:33` | Identity picker, if anywhere — **dropped by decision** | ✗ |
| 11 | Password / account | — | Shell Settings | ✗ |
| 12 | Update applications | — | Shell Settings | ✗ |
| 13 | Topic management | `EXPERIENCE.md:81` | Library — spine already assigns it there | ✗ |
| 14 | Note visibility default | Shared-by-default | `NoteComposer` — toggle already there | ✗ |
| 15 | About / version / data location | — | Nowhere else | ~ (thin, no FR) |
| 16 | Export / backup vocabulary | — | Nowhere else | ~ (thin, no FR) |

### The pattern

**Twelve of sixteen have a better home**, and it is the same two homes repeatedly:

1. **Where the thing is used** — Practice setup, Library, NoteComposer, identity picker.
2. **The shell** — account, password, container updates.

Items 1–4 are the most instructive. They are precisely the ones PRD §6.2 already
deferred ("persisted per-User practice preferences"), and **none of them wants a
screen — they want *memory***. "Remember what I picked last time" is a store
change on the page that already owns the control, not a settings surface.

### Idea #8 — the survivor

**[Data ownership #8]: Clean Slate**
*Concept:* Reset the **active user's** familiarity progress to zero — every word
back to New — leaving authored content untouched.
*Novelty:* It is not a settings toggle. It is the only candidate that is
destructive, person-scoped, and rare, and those three properties together are
what defeat every alternative home.

**Why it cannot live elsewhere:**
- **Not the Library overflow menu** — that menu operates on *words*; progress is a
  property of a *person*, not a word. Its bulk actions are additive; this destroys.
- **Not the avatar menu** — a wipe-everything row sitting one mis-tap below
  "Switch to Dani" is a hazard, and a dropdown has no room for a proper confirm.
- **Not the shell Settings** — that is platform scope. Hotaru progress is app state.

**Why the danger is the argument *for* a screen:** it needs room to state what
will be destroyed, whose it is, and to carry a confirm step. That is a screen's
job, not a menu row's.

## Decisions

### VERDICT: build it, and build it small

The Settings screen **exists**, justified by exactly one item. The dead menu item
at `AvatarSwitcher.vue:69` gets a real destination.

### Scope rulings (Your Highness)

1. **Unit of reset = ALL progress**, not per-word and not per-selection. A
   per-word reset was considered and rejected as the wrong grain.
2. **Familiarity only.** Reset clears `users/{id}/progress.json` — the tier and
   review data. It does **not** touch `words_private.json` or authored notes.
   *Rationale:* private words and notes are **content the person authored**;
   wiping authored content because someone wanted a fresh drilling slate is a
   nasty surprise. Progress is earned state; content is owned property.
3. **Per-user, and the screen must say whose.** Progress is stored per user. The
   action must name the active user ("Reset Jake's progress") or Dani wipes
   Jake's six months by not noticing who is signed in. **This is the single
   biggest failure mode of the feature.**
4. **User management (#10) — not implemented.** Feasibility was assessed and it is
   achievable, but rejected as unnecessary. Recorded below so the analysis is not
   re-done.

### Rationale worth carrying into the story

A no-guilt reset is the **conclusion of the product's philosophy, not a
concession to it**. Hotaru is built on *queue, not debt* — no streaks to protect,
no punishment for lapsing (PRD SM-C1). "Start over, nothing held against you" is
the same stance applied to the whole library at once.

### Guardrail check

The survivor clears all three binding constraints: it manufactures no engagement
(SM-C1), creates no persistent obligation (no-debt-wall rule), and is not
speculative scope — it is a stated user need.

## Feasibility note — user management (#10), assessed then dropped

Preserved so the investigation is not repeated.

**Backend — moderate, mostly mechanical:**
- `_USERS` is a hardcoded module-level list (`backend/app/routers/hotaru.py:33`);
  `VALID_USER_IDS` derives from it at import time.
- Making it dynamic needs a `hotaru_users_repo` writing `users.json` through
  `_atomic_write_json`, and `VALID_USER_IDS` becoming a lookup rather than a
  constant — **the actual work is 10 validation call sites** (`hotaru.py:53, 60,
  80, 104, 116, 123, 139, 146, 162`).
- Then `POST /users` plus service-layer validation (unique id, slug the name,
  reject empty).
- Storage needs nothing: `local-data/hotaru/users/{id}/` is created lazily —
  `jim/` has `progress.json` but no `words_private.json` yet.

**Frontend — one genuine blocker:**
- Avatar colour is a hardcoded class per id (`AvatarSwitcher.vue:92-99`):
  `--dani`→`fam-2`, `--jake`→`fam-4`, `--jim`→`fam-5`. **A fourth user renders
  with no background at all.** Needs a colour strategy (cycle the fam ramp by
  index, or store a colour on the user record) before any dynamic roster.
- `IdentityPage` reads from the store and would pick up new users for free.

**Scope note:** PRD §6.2 lists "User expansion / accounts" as out of MVP scope —
though that premise was already stretched once: commit `89d8487` added Jim by
hand-editing `_USERS`. The deciding question was *"does someone who isn't you
need to add a person?"* — answered **no**. Hand-editing the list remains
acceptable.

**If it is ever revived:** the natural home is beside **"Who's studying?"** on
`IdentityPage`, not in Settings — the identity picker is where the household
roster is already the subject.

## Action Planning

Three separate pieces of work came out of this session. Only the first is small.

### 1. Build the Settings screen (immediate — resolves the dead menu item)

- Route a Hotaru-scoped Settings surface; wire `onSettings()` in
  `AvatarSwitcher.vue:69` (currently an empty function with a stale comment
  claiming no Settings screen exists — `SettingsPage.vue` does exist at
  `/settings`, but it is the *platform* screen).
- Single action: **reset the active user's familiarity progress**, naming the
  user, behind a confirm.
- Backend: a reset endpoint clearing `users/{id}/progress.json` only, written via
  `_atomic_write_json` through the repository layer.
- Closes the `EXPERIENCE.md:155` open item ("Settings surface … left as a stub
  for v1") and the deferred UX item "Settings menu contents — unspecified".

### 2. Persist practice preferences (separate — returns to PRD §6.2)

Candidates 1–4 are one piece of work and it is **not** a settings screen. Direction,
Scoring, Quick-Practice preset and session limit want *"remember last used"* on
the Practice setup page. Still explicitly deferred by PRD §6.2; this session
did not lift that deferral, only clarified the correct shape.

### 3. Thin survivors — left unbuilt (no FR, no expressed need)

Motion override (#5), About/data (#15), Export (#16). All three lack another
home, but none was wanted. If the Settings screen ever needs a second item,
these are the queue — **About/data is the most natural** companion to a
destructive action, since it explains where the data being destroyed lives.

## Session Summary

**Technique:** Assumption Reversal (single technique — the AI-recommended
three-phase sequence was simplified at the user's request).
**Candidates generated:** 16.
**Survived the "where else could this live?" test:** 1.

**The verdict was earned rather than assumed** — which was the stated goal. The
screen exists, but for one reason only, and the inventory documents why the other
fifteen candidates do not belong there. That record is the durable output: it
makes future "should this go in Settings?" questions answerable by reference.

**Most important single finding:** most things that *feel* like settings in this
app are really **memory** ("remember my last choice") or belong **where they are
used**. Only destructive, person-scoped, rare actions need a settings surface.
