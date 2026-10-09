# Story: Cha Xi Journal

## Status
Ready for Review

## Story
**As a** tea drinker at the table,
**I want** to write the cha xi of a sitting while I brew, and to look back through every sitting in a Journal,
**so that** the reflective half of the practice is kept beside the precise half, and a year of tea is a pleasure to revisit.

## Acceptance Criteria
1. With a tea on the timer, a **Cha Xi** header button opens `/tea/timer/cha-xi`; it carries a dot once the session has any cha xi.
2. The Cha Xi page edits one photo, moods (several, from calm · bright · contemplative · cosy · social · focused · tired · restless), guests and notes. Edits are kept on the phone at once and sync about 1.5 s after typing pauses, and on leaving the page.
3. A sticky brew strip shows the infusion, elapsed / target, and a start/stop button that behaves like the timer's tap; tapping the strip returns to the timer. A steep started on the timer chimes on the Cha Xi page, and never chimes twice for one target.
4. With nothing brewing, the Cha Xi page sends you to the timer. Discarding a session deletes its photo.
5. The tea home shows a **Journal** tile between Brew and Almanac. `/tea/journal` lists every finished sitting in the cabinet, newest first under month headings: photo cards for sittings with a photo, compact cards for the rest, with a "+ cha xi" hint on your own plain ones and the brewer's name on others'.
6. **Cha xi only** narrows the wall to sittings with a photo, mood, guests or notes, and is remembered for the browser session.
7. An entry page shows photo, tea (linked to the Cabinet), date, brewer, vessel, leaf, water, rating, moods, guests, notes and the infusion timeline.
8. The brewer can **Edit** (cha xi, rating, leaf, water, vessel; plus day and tea for journal-only entries) and **Delete** (confirming, and naming the grams returned). Changing the leaf moves the tea's grams by the difference; editing anything else never moves them.
9. **+ Entry** records a journal-only sitting for a Cabinet tea or an away tea (name, optional class). Grams are taken only for a Cabinet tea, and only if entered.
10. A tea's session rows open their Journal entry. Deleting a tea removes its sessions' photos.

## Dev Notes
- Spec: `docs/superpowers/specs/2026-09-28-tea-cha-xi-journal-design.md`; plan: `docs/superpowers/plans/2026-09-29-tea-cha-xi-journal.md`.
- Cha xi is `cha_xi` + server-owned `image_url` on `TeaSession` (tea doc schema v5). A journal-only entry is `timed: false`, finished in one PUT.
- Deleting a finished sitting is `DELETE /sessions/{id}/journal`. The timer's `DELETE /sessions/{id}` still refuses a finished session, so a Discard after a lost finish response can't delete it.
- The chime's `AudioContext` is module state, so one unlock serves every page.
- Out of scope: Journal search and filters (FR-20), flavour wheel, several photos, editing others' sittings.
