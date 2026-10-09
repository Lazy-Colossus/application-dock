# Story: Multiple brew sessions

## Status
Ready for Review

## Story
**As a** tea drinker with more than one tea on the go,
**I want** to keep several brew sessions open and pick which one to continue when I open Brew,
**so that** I can move between teas through the day without finishing or losing one.

## Acceptance Criteria
1. Opening Brew with nothing active and open sessions on the server shows them as cards — tea, vessel, when started, infusions so far — with Continue and Discard, and a New brew button that shows the timer ready to start. With none open, Brew goes straight to the timer.
2. The timer's ⋯ menu has Switch session for a tea session: it saves the session and returns to the picker, which lists it. It is disabled mid-steep and absent for a plain timer.
3. If the save fails, the session stays active and an error says so.
4. Brew from another tea's page parks the active session (if it has brewed steeps) and continues that tea's open session, or starts one. Mid-steep it refuses with a notice. A session with no steeps yet just swaps tea, as before.
5. Only one steep times at a time.

## Dev Notes
- Spec: `docs/superpowers/specs/2026-10-04-tea-multiple-brews-design.md`; plan: `docs/superpowers/plans/2026-10-04-tea-multiple-brews.md`.
- Parked sessions live on the server as `in_progress`; the phone keeps one active session in `tea-timer:live`. `useTeaTimerStore.park()` pushes then clears.
- Out of scope: simultaneous steeps; parking a plain timer.
