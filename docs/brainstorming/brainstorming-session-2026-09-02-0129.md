---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - CLAUDE.md
  - frontend/src/apps/registry.ts
session_topic: 'Name the new shared-availability calendar app for the Application Dock'
session_goals: 'A shortlist of candidate names, then one chosen name with id / label / Material icon'
selected_approach: 'ai-recommended (lean — single technique, at user request)'
techniques_used: ['Metaphor Mapping', 'Comedic Angle Sweep']
ideas_generated: 20
verdict: 'KDH — id `kdh`, label KDH, icon `event_available` (superseded Moot)'
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** Your Highness
**Date:** 2026-09-02

## Session Overview

**Topic:** Name the new shared-availability calendar app for the Application Dock
**Goals:** A shortlist of candidate names, then one chosen name with id / label / Material icon

### Context Guidance

The app: a small, known group (e.g. 6 people) each click the days they are free on a shared
month view; days with the most overlap light up brightest, and an admin marks the day that won.
Admins (an allowlist inside the app) create calendars and manage the invitee list; everyone else
shares one dock login, picks their name and colour, and votes.

**Naming constraints:**
- Sits beside existing dock apps: *Archery Score Counter*, *Hotaru*, *Context-Switch*, *Listies* —
  short, one or two words, often slightly oblique or playful.
- Becomes three things at once: the `id` (kebab-case, used in URLs, filenames, router prefixes),
  the `label` on the landing-page card, and a folder name under `docs/stories/`.
- Should survive being said out loud between friends: "put it in <name>".

### Session Setup

Single technique at the user's request — no multi-phase plan. **Metaphor Mapping**: name the app
by first deciding what it *is* metaphorically, then harvesting vocabulary from that metaphor.

## Technique — Metaphor Mapping

The probe: the app's core moment is not "scheduling". It is six calendars laid on top of each
other until one day glows through all of them. Four metaphor frames were mapped, each harvested
for the vocabulary it drags along.

**[Frame 1] Overlap — a Venn diagram of six lives**
_Concept_: The value is the intersection; empty space is everywhere and you are hunting the
sliver where everyone coincides.
_Vocabulary_: Overlap · Coincide · Common · Crossing · Sliver
_Novelty_: Names the geometry rather than the calendar, but stays literal.

**[Frame 2] Quorum — a gathering waiting to become legitimate**
_Concept_: A quorum is the minimum number of people who must be present for a meeting to count —
which is precisely the highlight rule: a day is worth something once enough of you are on it,
brightest at full attendance.
_Vocabulary_: Quorum · Moot · Muster · Convene · Assembly
_Novelty_: The only frame whose vocabulary already contains the central mechanic, so the words
keep paying off in interface copy ("short of quorum", "the moot is set").

**[Frame 3] Signal fire — a dark month that lights up where people stand**
_Concept_: Days brighten as bodies accumulate; the winning day is visible from across the room.
_Vocabulary_: Beacon · Kindle · Ember · Lumen · Flare
_Novelty_: Directly describes the heat-map visual — but rhymes with **Hotaru** (firefly) already
on the dock, so it risks reading as a repeat rather than a family.

**[Frame 4] Roll call — a hand going up**
_Concept_: Not a calendar at all; a show of hands held over a set of dates. Native to the
tabletop-game framing that prompted the app.
_Vocabulary_: Roll Call · Hands · Tally · Ayes · Party
_Novelty_: Reframes the artifact as a vote, which is what it mechanically is.

## Round 1 verdict (superseded)

**Moot** — from Frame 2. An old word for an assembly called to decide something: short, one
syllable, sits naturally beside *Hotaru* and *Listies* in the dock's oblique-but-friendly naming,
and keeps the gathering metaphor available throughout the UI.

## Round 2 — Comedic Angle Sweep

Reopened after the epic list was drafted: the name was correct but too dry. The comedy in this
app is specific — six adults trying to find one evening is famously impossible, and everyone has
lived the group-chat version of it. Five veins were swept:

**[Vein 1] Deadpan bureaucracy** — treat movie night with parliamentary gravity (the vein *Moot*
itself came from, played harder).
_Candidates_: Whip · Quorum · Adjourned · The Motion Carries · Minutes
_Novelty_: `Whip` is the sharpest — a parliamentary whip's literal job is counting who will
actually show up, and being domineering about a movie night is the joke.

**[Vein 2] Cosmic rarity** — the alignment is astronomical, not social.
_Candidates_: Syzygy · Conjunction · Alignment · Eclipse
_Novelty_: `Syzygy` is an absurdly over-grand word for "we found a Tuesday" that is nonetheless
literally accurate — a rare alignment of three or more bodies.

**[Vein 3] Cheerful futility** — name it after the outcome.
_Candidates_: Eventually · Soon™ · Never Free · How's Never · Q3 Maybe

**[Vein 4] Non-committal energy** — name it after the "if needed" state.
_Candidates_: Definitely Maybe · Pencil Me In · Penciled · Ish · Tentatively

**[Vein 5] Tabletop in-joke** — the campaign that never meets is TTRPG's oldest running gag.
_Candidates_: Gather The Party · Nat 20 · Session Zero · Venture Forth

## Verdict

**KDH** — an inner joke belonging to the group that will use it. It beats every candidate above on
the only axis that matters for a six-person app: it is already funny *to them*, without needing the
joke explained. The generated shortlists served as contrast, not as the answer.

| Field | Value |
|---|---|
| `id` | `kdh` |
| `label` | KDH |
| `icon` | `event_available` (Material Icons) |
| `route` | `/kdh` |
| stories | `docs/stories/kdh/` |

## Next Step

Design spec at `docs/superpowers/specs/2026-09-02-kdh-design.md`, then the epic breakdown via
`bmad-create-epics-and-stories`.
