# Multiple Brew Sessions — Design Spec

Date: 2026-10-04
App id: `tea`
Status: approved in brainstorming, pending implementation plan

## Problem

The timer holds one live session. To brew a different tea you have to finish or discard the one
you're on; Brew from another tea's page is blocked with "finish or discard it first". The server
already stores any number of `in_progress` sessions, and the timer page already offers resume cards
for them — but only when nothing is live, and nothing lets you step away from a live session.

## Intent

User's answers:

- Several brew sessions can be open at once; **opening Brew lets me pick which to continue, or
  start a new one**.
- **One steep times at a time.** Only the session I'm on has a clock and a chime; switching happens
  between steeps.

Success: two teas can be on the go through a day, and moving between them never loses a steep.

## Scope

**In scope:** a `park()` action on the timer store; a session picker on the timer page when nothing
is live; a "Switch session" menu item; Brew from a tea's page parking the active session instead of
refusing.

**Out of scope:** simultaneous steeps (several clocks/chimes); parking a plain timer (no tea);
local-only storage of parked sessions; any backend change.

## Approach

The server is the store of parked sessions. The phone keeps exactly one active session in
`tea-timer:live`, as today. Parking = push the active session as `in_progress`, then clear it
locally. The picker lists `GET /tea/sessions?status=in_progress`. A session parked on one device
therefore shows up on every device.

## Behaviour

### Brew menu (timer page, nothing live)

- **Open sessions exist** → the page shows a picker instead of the cup: one card per session
  (tea name, vessel name when known, started when, brewed-infusion count) with **Continue** and
  **Discard** — the existing `RecoveryCard`, extended with the vessel — and a **New brew** button
  under them.
  - Continue = today's resume.
  - New brew hides the picker and shows the timer ready to start, exactly like an empty Brew page
    today (pick a tea, or just time).
- **No open sessions** → straight to the timer, as today.

### Leaving a session

- The ⋯ menu gains **Switch session**, disabled while a steep is running and hidden for a plain
  timer (no tea — it can't be stored on the server; End or pick a tea first).
- It calls `park()`; on success the page shows the picker (refetching open sessions, so the one
  just parked is in it). On failure the session stays live and the error shows; nothing is dropped.

### Brew from a tea's page (`?tea=<id>`)

Unchanged: nothing live → continue that tea's open session if any, else attach the tea to a new
one; live session already for this tea → stay; live plain timer → adopt the tea.

Changed: a live session for a **different** tea →

- mid-steep → keep today's notice and don't switch;
- otherwise → `park()` it, then behave as if nothing were live (continue this tea's open session
  if it has one, else start a new one). If parking fails, stay on the current session with the
  error.

## Store

`useTeaTimerStore.park(): Promise<boolean>`

- No live session, a plain timer, or a running steep → `false`, no request.
- Push the snapshot as `in_progress`. Success → clear the live session, return `true`.
  Failure → keep it live, return `false`. A network/server failure sets `error`; a 404 (tea
  deleted elsewhere) has already detached the tea and set `notice`, leaving a plain timer. A
  refused vessel is dropped and re-pushed by `push()` itself, so that still parks.

`push()` today swallows failures into `unsynced`/`notice`; `park()` must know the outcome, so it
checks the session afterwards: still live, still has its tea, and `unsynced` is false.

Everything else — tea/vessel/leaf, steep pills, Cha Xi, photo, finish, discard — acts on the single
live session and is unchanged.

## Testing

- Store: `park` pushes then clears; refuses a plain timer and a running steep without a request;
  keeps the session and reports when the push fails.
- Timer page: picker renders with open sessions and New brew shows the timer; Continue resumes;
  Switch session is disabled mid-steep, hidden for a plain timer, and parks then shows the picker;
  `?tea=` for a different tea parks the live session and starts/continues the requested one;
  `?tea=` mid-steep keeps the notice.
- `RecoveryCard`: shows the vessel name when given.
