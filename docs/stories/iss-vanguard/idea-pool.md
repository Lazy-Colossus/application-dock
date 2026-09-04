# ISS Vanguard Companion — Idea Pool

A companion app for the cooperative board game **ISS Vanguard** (Awaken Realms).
Goal: take the fiddly between-mission bookkeeping off the table so play flows.

Candidate features to consider when designing the app. Not yet scoped or
prioritised — this is the pool we draw from when we start real story work.

## Core features (requested)

### 1. Ship Phase "what's the next step?"
An automated, guided walkthrough of the ship phase so you never miss or
mis-order a step.
- Steps you through the ship-phase sequence one action at a time, in the correct
  order, with a clear "do this now → next" flow.
- Tick each step off; the app advances and tells you what's next.
- Where a step is conditional ("only if you have X", "skip if Y"), it asks the
  question and routes accordingly instead of making you decode the rulebook.
- Resume-safe: you can stop mid-phase and pick up exactly where you left off.
- (To confirm against the rulebook when we design: the exact step order and the
  names of the ship-phase departments/actions.)

### 2. Resource / materials tracker
Track what's aboard the ship and what projects need.
- **On board:** current stock of each material/resource, adjustable up/down as you
  gain or spend.
- **Projects:** each project (research/upgrade/build) lists the materials it needs;
  the app shows how much you have vs. how much is still required.
- **Shortfall view:** at a glance, "you still need N of X for project Y" — so you
  know what to prioritise gathering on the next mission.
- Optional: mark a project as started/completed and auto-deduct its cost from stock.

## Possible extensions (park for later)
- Campaign/log state: current chapter, unlocked cards/upgrades, crew roster.
- Crew/character sheet tracking (levels, skills, injuries, keywords).
- Mission prep checklist (which cards/decks to grab before a launch).
- Multi-device shared state so the whole table sees the same tracker.

## Notes
- Suggested v1 scope: the two requested features — Ship Phase walkthrough +
  Resource tracker. Everything under "extensions" is later.
- Data is board-game rules content: the ship-phase step list and project material
  costs need to be transcribed accurately from the rulebook/game components when we
  build the seed dataset.
