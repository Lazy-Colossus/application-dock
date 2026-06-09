---
stepsCompleted: [1, 2, 3, 4]
status: complete
completedAt: '2026-05-28'
inputDocuments:
  - docs/planning-artifacts/prds/prd-Code-2026-05-26/prd.md
  - docs/planning-artifacts/architecture.md
---

# Multi-App Platform — Archery Score Counter - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for the Multi-App Platform (Archery Score Counter v1), decomposing the requirements from the PRD and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

FR-1.1: Landing page displays navigation menu listing available apps as large, tappable cards
FR-1.2: Shell is extensible — adding a new app requires only registering it in the menu; no changes to existing apps
FR-1.3: A persistent home control is accessible from every screen inside any app
FR-2.1: Operator starts a new session from the Archery app home screen
FR-2.2: Archer names entered one at a time; minimum 1; names must be non-empty and unique within session
FR-2.3: Operator confirms roster and proceeds to scoring board; roster cannot be edited mid-session
FR-2.4: Session auto-labeled YYYY-MM-DD for first session of day; YYYY-MM-DD #2, #3 etc. for subsequent
FR-2.5: Scoring board displays 18 target icons numbered 1–18
FR-2.6: Targets may be entered in any order; tapping a target opens score-entry panel
FR-2.7: Score-entry panel cycles through each archer in roster order; two shots entered sequentially per archer
FR-2.8: Valid shot values are 0, 5, 8, 10, 11 — each presented as a large tap button; no free-text
FR-2.9: The 11 button is visually distinguished (gold highlight) as bullseye indicator
FR-2.10: Within score-entry panel, operator may navigate back to previous archer to correct entry before confirming target
FR-2.11: When all archers have both shots entered, operator confirms target; target icon turns green
FR-2.12: A confirmed target can be reopened to correct scores at any point before finalisation; re-opening resets green state
FR-2.13: When all 18 targets are green, a non-blocking "View Results" prompt appears
FR-2.14: Results screen shows each archer's name and total score (max 396), ranked highest to lowest
FR-2.15: Results screen includes per-archer, per-target breakdown as scrollable table: target → shot 1, shot 2, subtotal
FR-2.16: From results screen, operator can finalise session (writes to persistent storage) or return to correct scores
FR-2.17: Finalising returns to Archery app home screen
FR-2.18: Archery app home screen has a History entry point listing all saved sessions, newest first
FR-2.19: Each history entry displays: session label, archer count, winner name, winning score
FR-2.20: Tapping a history entry opens the full read-only results view for that session
FR-2.21: History is append-only — sessions are not deletable or editable after finalisation
FR-3.1: No database; all session data stored as JSON files on server filesystem
FR-3.2: One file per session; naming mirrors session label: YYYY-MM-DD.json, YYYY-MM-DD-2.json
FR-3.3: JSON schema: session label, created timestamp, ordered archer roster, per-target per-archer shot values (two per archer)
FR-3.4: Files stored in DATA_DIR env var, defaulting to /data in container, mounted as Docker volume
FR-3.5: In-progress sessions auto-saved to temp file after every archer's two shots confirmed per target
FR-3.6: On loading Archery app, BE checks for temp file; if found, user offered resume or discard
FR-3.7: On resume, board restored to exact state — completed targets green, remaining open; any device on LAN may resume
FR-3.8: Only one in-progress session at a time; on finalisation temp file replaced by permanent file; on discard it is deleted

### NonFunctional Requirements

NFR-1: Responsive layout works on phones (≥360px wide) and desktop without separate builds
NFR-2: All interactive tap targets ≥44px height/width (WCAG touch target guidance)
NFR-3: No user accounts, no auth, no network dependency beyond local Docker host
NFR-4: Initial page load ≤3s on local network (LAN/hotspot)
NFR-5: Full stack runs via single docker compose up with no manual build steps

### Additional Requirements

- ARCH-1: Custom scaffold — npm create quasar@latest frontend (Vite + Vue 3 + TypeScript + Sass) + FastAPI backend
- ARCH-2: Multi-stage Dockerfile: node build stage (quasar build) → python serve stage; single image, single container
- ARCH-3: docker-compose.yml with named volume mounted at DATA_DIR (/data)
- ARCH-4: Backend layering: routers (HTTP only) → services (logic only) → repositories (file I/O only)
- ARCH-5: Atomic file writes: write to .tmp then os.replace() for all persistence operations
- ARCH-6: All Pinia stores expose loading + error refs alongside data; all async actions use finally block
- ARCH-7: All HTTP calls routed through src/composables/useApi.ts — never raw fetch/axios in components
- ARCH-8: App registry via static src/apps/registry.ts (AppDescriptor[]) — shell reads this directly, no store
- ARCH-9: Vue Router history mode with FastAPI catch-all serving index.html for non-/api/ paths
- ARCH-10: Dev proxy: quasar.config.js devServer.proxy routes /api/* to Uvicorn on port 8000

### UX Design Requirements

None — no UX Design document exists for this project.

### FR Coverage Map

```
FR-1.1: Epic 1 — App cards on shell landing page
FR-1.2: Epic 1 — registry.ts extensibility pattern
FR-1.3: Epic 1 — Persistent home button in MainLayout
FR-2.1: Epic 2 — New session entry point on ArcheryHomePage
FR-2.2: Epic 2 — Roster entry with uniqueness validation
FR-2.3: Epic 2 — Roster confirmation, immutable mid-session
FR-2.4: Epic 2 — Auto-label generation (YYYY-MM-DD, #2, #3…)
FR-2.5: Epic 2 — ScoringBoardPage with 18 target icons
FR-2.6: Epic 2 — Any-order target selection
FR-2.7: Epic 2 — ScoreEntryPanel cycling through archers
FR-2.8: Epic 2 — ShotButton (0/5/8/10/11) large tap targets
FR-2.9: Epic 2 — Gold highlight on 11 button
FR-2.10: Epic 2 — Back-navigation within score entry panel
FR-2.11: Epic 2 — Target confirmed → icon turns green
FR-2.12: Epic 2 — Reopen confirmed target, resets green state
FR-2.13: Epic 2 — Non-blocking View Results prompt at 18/18
FR-2.14: Epic 2 — ResultsPage ranked totals (max 396)
FR-2.15: Epic 2 — Per-archer per-target breakdown table
FR-2.16: Epic 2 — Finalise or return from results screen
FR-2.17: Epic 2 — Finalise returns to ArcheryHomePage
FR-2.18: Epic 4 — History list, newest first
FR-2.19: Epic 4 — History entry: label, count, winner, score
FR-2.20: Epic 4 — Tap entry → read-only results view
FR-2.21: Epic 4 — Append-only, no delete/edit
FR-3.1: Epic 2 — JSON files, no database
FR-3.2: Epic 2 — File naming convention
FR-3.3: Epic 2 — Session JSON schema
FR-3.4: Epic 1 — DATA_DIR env var + Docker volume (Story 1.1: config.py + Compose volume)
FR-3.5: Epic 3 — Auto-save to _in_progress.json per confirmed target
FR-3.6: Epic 3 — Resume/discard prompt on app load
FR-3.7: Epic 3 — Full board state restoration from server
FR-3.8: Epic 3 — Single in-progress session, replace on finalise
```

## Epic List

### Epic 1: Platform Foundation & Shell
Users can open the app in a browser and navigate to any registered app from a mobile-friendly landing page. The full stack runs from a single Docker command.
**FRs covered:** FR-1.1, FR-1.2, FR-1.3
**ARCH covered:** ARCH-1 through ARCH-10

### Epic 2: Archery Score Session
Users can run a complete archery scoring session from start to finish — enter a roster, score all 18 targets in any order, correct scores, view ranked results with per-target breakdowns, and finalise the session to persistent storage.
**FRs covered:** FR-2.1, FR-2.2, FR-2.3, FR-2.4, FR-2.5, FR-2.6, FR-2.7, FR-2.8, FR-2.9, FR-2.10, FR-2.11, FR-2.12, FR-2.13, FR-2.14, FR-2.15, FR-2.16, FR-2.17, FR-3.1, FR-3.2, FR-3.3, FR-3.4

### Epic 3: Session Continuity
A session in progress is automatically saved after every confirmed target, survives browser close or device swap, and can be resumed or discarded when the app is reopened — from any device on the LAN.
**FRs covered:** FR-3.5, FR-3.6, FR-3.7, FR-3.8

### Epic 4: Session History
Users can browse all past finalised sessions from the Archery home screen, newest first, and tap any session to view the full read-only results and per-target breakdown.
**FRs covered:** FR-2.18, FR-2.19, FR-2.20, FR-2.21

### Epic 5: Polish & UX Refinements (post-validation follow-ups)
UI polish items surfaced during story validation that don't fit cleanly inside the original epic boundaries. Added 2026-05-28 by the PO; status: pending.
**FRs covered:** FR-2.4 (display form of session labels)

### Epic 6: Multiple Concurrent Sessions & Home Redesign
The app moves from a single in-progress session to multiple concurrent ones. The Archery home screen is redesigned around three standard actions — New Session, Resume, History — with a resume picker scoped to the current UTC day and an editable, date-defaulted session name. Added 2026-05-29 by the PO; status: pending.
**FRs covered:** FR-6.1, FR-6.2, FR-6.3, FR-6.4, FR-6.5, FR-6.6

### Epic 7: Scoring & Score-Entry Overhaul
The scoring board and score-entry drawer are reworked for one-handed field use and flexible editing: a drawer that opens only on demand and saves on close, partial entries that default to 0, direct tap-to-edit of any archer or shot, bottom-anchored controls, and an always-available results view that treats unentered scores as 0. Added 2026-05-29 by the PO; status: pending.
**FRs covered:** FR-7.1, FR-7.2, FR-7.3, FR-7.4, FR-7.5, FR-7.6, FR-7.7

### Epic 8: Roster Speed & Recurring Players
Roster entry keeps focus in the name field after each add, and a server-side recurring-players list (managed from the Archery home screen) can be picked from when building a session roster. Added 2026-05-29 by the PO; status: pending.
**FRs covered:** FR-8.1, FR-8.2, FR-8.3

### Epic 9: History Enrichment & App Iconography
History entries surface the top 3 archers and their scores in the subtext, and the Archery app icon becomes a thematic monochrome glyph. Added 2026-05-29 by the PO; status: pending.
**FRs covered:** FR-9.1, FR-9.2

---

## Epic 1: Platform Foundation & Shell

Users can open the app in a browser and navigate to any registered app from a mobile-friendly landing page. The full stack runs from a single Docker command.

### Story 1.1: Project Scaffold & Infrastructure

As a developer,
I want a fully scaffolded project with a working dev environment and a single `docker compose up` production build,
So that the team can start building features immediately without environment friction.

**Acceptance Criteria:**

**Given** the repository is cloned
**When** `docker compose up` is run
**Then** the application is accessible at `http://localhost:8000` with a 200 response

**Given** the dev environment is set up
**When** `npm run dev` (frontend) and `uvicorn app.main:app --reload` (backend) are started
**Then** the Quasar dev server runs on port 9000 and proxies `/api/*` to port 8000

**Given** the project structure
**When** a developer inspects it
**Then** it matches exactly: `backend/app/{main.py,routers/,services/,repositories/,schemas/,core/}` and `frontend/src/{apps/,components/,layouts/,pages/,router/,composables/,css/}`

**Given** the Docker build
**When** the image is built
**Then** a multi-stage Dockerfile runs `quasar build` in a node stage and copies `dist/spa/` into the Python stage; `requirements.txt` and `package.json` are the only dependency manifests

**Given** the environment configuration
**When** `DATA_DIR` env var is set
**Then** it is read by `app/core/config.py`; if unset, it defaults to `/data`

### Story 1.2: Multi-App Shell — Landing Page & Navigation

As an operator,
I want a mobile-friendly landing page that shows all available apps as large tappable cards,
So that I can quickly navigate to any app without reading instructions.

**Acceptance Criteria:**

**Given** the app loads at the root URL
**When** the shell landing page renders
**Then** each entry in `src/apps/registry.ts` appears as an `AppCard` with icon and label; cards are ≥44px tap targets

**Given** a registered app entry in `registry.ts`
**When** an operator taps the app card
**Then** they are routed to the app's route using Vue Router history mode with no full-page reload

**Given** any screen inside any app
**When** the operator looks for a way to return home
**Then** a persistent home control is visible and tapping it returns to the shell landing page (`/`)

**Given** a new app is added to `registry.ts`
**When** the shell loads
**Then** the new app card appears automatically — no changes required to `HomePage.vue`, `MainLayout.vue`, or any router file other than adding the lazy-loaded route

**Given** the `GET /api/apps` endpoint
**When** called
**Then** it returns the list of registered apps as JSON (matching registry.ts entries); response is direct array, no envelope wrapper

**Given** a screen width of 360px
**When** the landing page renders
**Then** layout is usable with no horizontal scroll and all tap targets remain ≥44px

---

## Epic 2: Archery Score Session

Users can run a complete archery scoring session from start to finish — enter a roster, score all 18 targets in any order, correct scores, view ranked results with per-target breakdowns, and finalise the session to persistent storage.

### Story 2.1: Session Data Model & Repository

As a developer,
I want a validated session data model and file repository,
So that all session data is read and written consistently and safely throughout the application.

**Acceptance Criteria:**

**Given** the Pydantic schema in `backend/app/schemas/session.py`
**When** a session object is created
**Then** it contains: `label` (str), `created` (ISO 8601 str), `status` ("in_progress" | "finalised"), `archers` (ordered list of str), `targets` (list of target objects with `number` and `scores` keyed by archer name, two integers each)

**Given** `session_repo.py`
**When** `write_session(path, session)` is called
**Then** it writes to a `.tmp` file first, then calls `os.replace()` to atomically replace the target path; no partial writes are ever visible

**Given** `session_repo.py`
**When** `list_sessions()` is called
**Then** it returns all finalised `.json` files in `DATA_DIR`, sorted newest first by filename, excluding `_in_progress.json`

**Given** `DATA_DIR` contains session files
**When** `read_session(label)` is called
**Then** it returns the parsed `SessionData` object for the matching file, or raises a 404-equivalent if not found

**Given** the `core/config.py` settings
**When** `DATA_DIR` env var is not set
**Then** the default value `/data` is used; the directory is created if it does not exist on startup

### Story 2.2: Session Setup — Roster Entry

As an operator,
I want to start a new session and enter the archer roster before scoring begins,
So that scores are correctly attributed to each archer throughout the session.

**Acceptance Criteria:**

**Given** the operator is on the Archery app home screen
**When** they tap "New Session"
**Then** they are taken to the session setup screen with an empty roster and a name input field

**Given** the session setup screen
**When** the operator enters a non-empty, unique name and confirms
**Then** the name is added to the roster list; minimum 1 archer required to proceed

**Given** the operator enters a name that already exists in the roster
**When** they attempt to add it
**Then** an error message is shown and the duplicate is not added

**Given** the operator enters an empty name
**When** they attempt to add it
**Then** the entry is rejected with a validation message

**Given** at least one archer is in the roster
**When** the operator confirms the roster
**Then** they are taken to the scoring board and the roster is locked — no further additions or removals are possible

**Given** a new session is created
**When** the `POST /api/archery/sessions` endpoint is called
**Then** it returns the session object including an auto-generated label (`YYYY-MM-DD` for first session of the day, `YYYY-MM-DD #2` etc. for subsequent); the label logic lives in `archery_service.py`

### Story 2.3: Scoring Board

As an operator,
I want a visual board of 18 numbered target icons I can tap in any order,
So that I can score targets as my group reaches them on the field.

**Acceptance Criteria:**

**Given** the operator is on the scoring board
**When** it renders
**Then** 18 target icons numbered 1–18 are displayed; each is at minimum 44px in both dimensions

**Given** a target has not yet been confirmed
**When** it is displayed
**Then** the icon appears in its default (unconfirmed) state

**Given** a target has been confirmed
**When** it is displayed
**Then** the icon appears green

**Given** the operator taps any unconfirmed target
**When** the tap registers
**Then** the score-entry panel opens for that target

**Given** the operator taps a confirmed (green) target
**When** the tap registers
**Then** the target re-opens in the score-entry panel with its previously entered scores pre-populated; the green state resets until re-confirmed

**Given** a screen width of 360px
**When** the scoring board renders
**Then** all 18 icons are visible and tappable without horizontal scrolling

### Story 2.4: Score Entry Panel

As an operator,
I want to enter two shots per archer for a target using large tap buttons,
So that I can record scores quickly with one hand while outdoors.

**Acceptance Criteria:**

**Given** the score-entry panel opens for a target
**When** it renders
**Then** it shows the first archer's name and two shot slots; valid shot buttons (0, 5, 8, 10, 11) are displayed, each ≥44px

**Given** the operator taps a shot value for the first shot
**When** the value is selected
**Then** the first shot slot is filled and the second shot slot becomes active

**Given** both shots for an archer are entered
**When** the second shot is selected
**Then** the panel automatically advances to the next archer in roster order

**Given** the 11 button
**When** it renders
**Then** it is visually distinguished with a gold highlight distinct from the other shot buttons

**Given** the operator is on any archer (not the first)
**When** they tap "Back"
**Then** they return to the previous archer's entry with their previously entered values preserved

**Given** all archers have both shots entered
**When** the operator taps "Confirm Target"
**Then** the panel closes, the target icon turns green on the board, and the session store is updated

**Given** the operator re-opens a confirmed target
**When** the score-entry panel renders
**Then** the previously entered shot values are pre-populated for each archer; the target's green state is reset until re-confirmed

### Story 2.5: Session Results & Finalisation

As an operator,
I want to view ranked results with a per-target breakdown and finalise the session to permanent storage,
So that the session outcome is recorded and the group can see who won.

**Acceptance Criteria:**

**Given** all 18 targets are confirmed (all green)
**When** the scoring board renders
**Then** a non-blocking "View Results" prompt appears; the operator can still tap any target to revisit it

**Given** the operator navigates to the results screen
**When** it renders
**Then** each archer is shown with their total score (sum of all shots across all targets; max 396), ranked highest to lowest

**Given** the results screen
**When** the operator scrolls
**Then** a per-archer, per-target table is visible showing: target number, shot 1, shot 2, subtotal for each archer

**Given** the results screen
**When** the operator taps "Return to Scoring"
**Then** they return to the scoring board with all target states intact

**Given** the operator taps "Finalise Session"
**When** the action is confirmed
**Then** `POST /api/archery/sessions/in-progress/finalise` is called; the session is written to `DATA_DIR/YYYY-MM-DD.json` (or `YYYY-MM-DD-2.json` etc.) with `status: finalised`; the operator is returned to the Archery home screen

**Given** the finalise endpoint is called
**When** a file with the same label already exists
**Then** the next available suffix is used (e.g. `-2`, `-3`) and the file is written atomically

---

## Epic 3: Session Continuity

A session in progress is automatically saved after every confirmed target, survives browser close or device swap, and can be resumed or discarded when the app is reopened — from any device on the LAN.

### Story 3.1: Auto-Save In-Progress Session

As an operator,
I want the session to be automatically saved to the server after every confirmed target,
So that no scoring data is lost if the browser closes or the device loses connectivity.

**Acceptance Criteria:**

**Given** the operator confirms a target on the scoring board
**When** the confirmation is processed
**Then** `PUT /api/archery/sessions/in-progress` is called with the full current session state; the store's `saveTarget()` action handles this automatically — no manual save step required

**Given** the `PUT /api/archery/sessions/in-progress` endpoint
**When** it receives a valid session payload
**Then** `session_repo.write_in_progress(session)` is called, which writes to `_in_progress.tmp` then atomically replaces `_in_progress.json` via `os.replace()`

**Given** the in-progress file is being written
**When** the server process is interrupted mid-write
**Then** the previously valid `_in_progress.json` remains intact (atomic write guarantee)

**Given** only one in-progress session is allowed
**When** `_in_progress.json` already exists and a new target is confirmed
**Then** the file is overwritten (not appended); the single-file constraint is always maintained

**Given** the `useArcherySessionStore`
**When** `saveTarget()` is called
**Then** it sets `loading = true` before the request and `loading = false` in the `finally` block; any error lands in `store.error`

### Story 3.2: Resume & Discard In-Progress Session

As an operator,
I want to be offered the choice to resume or discard an in-progress session when I open the app,
So that I can recover from an accidental browser close without losing scored targets.

**Acceptance Criteria:**

**Given** `_in_progress.json` exists in `DATA_DIR`
**When** the operator opens the Archery home screen
**Then** a prompt is displayed offering "Resume Session" and "Start Fresh (Discard)" — it does not auto-navigate; the operator must choose

**Given** the operator taps "Resume Session"
**When** the action completes
**Then** `GET /api/archery/sessions/in-progress` returns the full session state; the scoring board renders with all previously confirmed targets green and all unconfirmed targets open — exact state restored

**Given** a device on the same LAN (not the original device)
**When** it opens the Archery home screen while `_in_progress.json` exists
**Then** the same resume prompt appears and resuming restores the full board state — state is server-side, not browser-local

**Given** the operator taps "Start Fresh (Discard)"
**When** the action completes
**Then** `DELETE /api/archery/sessions/in-progress` is called; `_in_progress.json` is deleted; the operator proceeds to session setup as if starting fresh

**Given** no `_in_progress.json` exists
**When** the operator opens the Archery home screen
**Then** no resume prompt appears; the normal home screen is shown with "New Session" and "History"

**Given** `GET /api/archery/sessions/in-progress`
**When** no in-progress file exists
**Then** the endpoint returns 404; the frontend treats this as "no session to resume"

---

## Epic 4: Session History

Users can browse all past finalised sessions from the Archery home screen, newest first, and tap any session to view the full read-only results and per-target breakdown.

### Story 4.1: Session History List

As an operator,
I want to see a list of all past sessions on the Archery home screen,
So that I can quickly find and revisit any previous round.

**Acceptance Criteria:**

**Given** the operator is on the Archery home screen
**When** they tap the History entry point
**Then** they are taken to `HistoryPage.vue` showing all finalised sessions, newest first

**Given** the history list renders
**When** sessions exist
**Then** each entry shows: session label, archer count, winner name, and winning score — all in a single `HistoryListItem` card ≥44px tall

**Given** the `GET /api/archery/sessions` endpoint
**When** called
**Then** it returns a direct array of session summaries (label, archer count, winner name, winning score), sorted newest first; winner and winning score are computed by `archery_service.py`, not the frontend

**Given** `useArcheryHistoryStore`
**When** `loadHistory()` is called
**Then** it sets `loading = true` before the request and `loading = false` in the `finally` block; errors land in `store.error`

**Given** no finalised sessions exist
**When** the history page renders
**Then** an empty state message is shown (e.g. "No sessions yet — finish a round to see it here")

**Given** a screen width of 360px
**When** the history list renders
**Then** all entries are readable and tappable without horizontal scrolling

### Story 4.2: Session History Detail

As an operator,
I want to tap a past session and see the full ranked results and per-target breakdown,
So that I can review any previous round in detail.

**Acceptance Criteria:**

**Given** the operator taps a session entry in the history list
**When** the navigation completes
**Then** `HistoryDetailPage.vue` renders the full results for that session using the same `ResultsTable` component as the live results screen

**Given** the history detail view
**When** it renders
**Then** it shows each archer's total score ranked highest to lowest, and a scrollable per-archer per-target breakdown (target number, shot 1, shot 2, subtotal) — identical layout to the live results screen

**Given** the `GET /api/archery/sessions/{label}` endpoint
**When** called with a valid session label
**Then** it returns the full `SessionData` object for that session; `session_repo.read_session(label)` handles the file lookup

**Given** the `GET /api/archery/sessions/{label}` endpoint
**When** called with a label that does not match any file
**Then** it returns 404; the frontend shows an error state

**Given** the history detail view
**When** the operator taps the back button or home control
**Then** no edit controls are present — the view is strictly read-only; no "Finalise" or "Return to Scoring" actions appear

**Given** sessions are finalised
**When** the operator is in the history detail view
**Then** there is no delete or edit option — history is append-only (FR-2.21)

---

# Additional Functionality — Batch 2 (2026-05-29)

Twelve enhancement/fix requests from the product owner, decomposed into Epics 6–9. Two architectural decisions were confirmed before drafting:

1. **Session model:** the app supports **multiple concurrent in-progress sessions** (replacing the single `_in_progress.json` model).
2. **Recurring players:** stored **server-side as a JSON file behind an API** (consistent with the no-DB architecture).

## New Functional Requirements

### Epic 6 — Multiple Concurrent Sessions & Home Redesign
- **FR-6.1:** Multiple in-progress sessions may exist concurrently. Each is persisted as its own file and is excluded from the finalised history list.
- **FR-6.2:** The Resume action on the Archery home screen is shown only when at least one in-progress session exists dated the **current UTC day**.
- **FR-6.3:** The Archery home screen presents three standard actions: **New Session**, **Resume**, **History**.
- **FR-6.4:** New Session always starts a fresh session. If one or more sessions are already in progress, a popup first asks whether to **delete** the existing in-progress session(s) or **leave them** running.
- **FR-6.5:** Resume opens a picker listing the current UTC day's in-progress sessions; the operator selects one to restore to exact state.
- **FR-6.6:** When creating a session, the session **name** is editable and preloaded with the date. A separate **date** field is persisted so sessions order by date even when the name differs.

### Epic 7 — Scoring & Score-Entry Overhaul
- **FR-7.1:** The score-entry drawer is hidden by default. It opens only when a target number is tapped, and closes when **Confirm Target** or the **X** (top-right) is tapped.
- **FR-7.2:** The current entry is persisted whenever the drawer closes (via Confirm or X).
- **FR-7.3:** Confirm Target is always actionable, even when not all shots are filled; every empty shot is saved as **0**.
- **FR-7.4:** Within the drawer, tapping an archer **name** jumps to that archer's entry; tapping the **shot-1** or **shot-2** slot selects that slot for re-entry. The "back to name" control is removed.
- **FR-7.5:** The scoring board's primary action controls are anchored to the **bottom** of the screen for one-handed thumb reach.
- **FR-7.6:** A persistent control (in the top bar, the same layer as the confirmed-target count) opens the results view at any time, even with targets unfilled; unentered targets and shots are counted as **0**.
- **FR-7.7:** Finalising a session writes all unentered targets and shots as **0**.

### Epic 8 — Roster Speed & Recurring Players
- **FR-8.1:** After adding an archer in roster entry, keyboard focus returns to the name input field.
- **FR-8.2:** A recurring-players list is persisted server-side and managed (add/remove) from the Archery home screen.
- **FR-8.3:** In session setup, recurring players can be added to the roster via a picker; the free-text custom-name field remains available.

### Epic 9 — History Enrichment & App Iconography
- **FR-9.1:** Each history entry's subtext shows the **top 3** archers and their scores.
- **FR-9.2:** The Archery app icon is a thematic, monochrome target/bow glyph.

## New FR Coverage Map

```
FR-6.1: Epic 6 — Multiple in-progress files; per-session in-progress persistence (Story 6.1)
FR-6.2: Epic 6 — Resume visibility gated on today's open sessions (Story 6.4)
FR-6.3: Epic 6 — New Session / Resume / History home buttons (Story 6.3)
FR-6.4: Epic 6 — New Session conflict popup (delete vs leave) (Story 6.3)
FR-6.5: Epic 6 — Resume picker over today's open sessions (Story 6.4)
FR-6.6: Epic 6 — Editable name + persisted date field (Stories 6.1 model, 6.2 UI)
FR-7.1: Epic 7 — Drawer open-on-tap / close-on-Confirm-or-X (Story 7.2)
FR-7.2: Epic 7 — Save-on-close persistence (Story 7.2)
FR-7.3: Epic 7 — Confirm with partial entry, empty→0 (Story 7.3)
FR-7.4: Epic 7 — Tap-to-edit name / shot slot; remove back link (Story 7.4)
FR-7.5: Epic 7 — Bottom-anchored board controls (Story 7.5)
FR-7.6: Epic 7 — Persistent top-bar View Results, zeros for unentered (Stories 7.1 BE, 7.5 FE)
FR-7.7: Epic 7 — Zero-fill on finalise (Story 7.1)
FR-8.1: Epic 8 — Focus returns to name input after Add (Story 8.1)
FR-8.2: Epic 8 — Recurring players store + API + management UI (Stories 8.2 BE, 8.3 UI)
FR-8.3: Epic 8 — Recurring-player picker in session setup (Story 8.4)
FR-9.1: Epic 9 — Top-3 subtext (Story 9.1 — BE summary + FE)
FR-9.2: Epic 9 — Thematic monochrome app icon (Story 9.2)
```

## Implementation Sequence (Batch 2)

Stories in Batch 2 have hard ordering dependencies — several frontend stories reference store methods and API shapes introduced by backend stories. **The SM must enforce this order on the board; do not pull a story before its prerequisites are merged.**

| Wave | Stories | Why |
|------|---------|-----|
| **0 — Independent** | 8.1, 8.2, 9.2 | No dependencies on other Batch-2 work; can start immediately and in parallel. |
| **1 — Backend foundations** | 6.1 → 7.1 | Both edit `schemas/session.py` + `archery_service.py`. **6.1 first** (multi-session storage + `name`/`date`), then **7.1** (partial targets + `confirmed` + zero-fill). 9.1 (BE summary) and 8.2 (already in Wave 0) are independent of these. |
| **2 — Home & creation FE** | 6.3, 6.4, 6.2 | Depend on 6.1's array `GET /sessions/in-progress` + per-label endpoints + store migration. **6.1 must land together with 6.3/6.4** (or with the back-compat shim in 6.1 Task 6) — see the blocking note in Story 6.1 (CC-1). |
| **3 — Scoring FE** | 7.2 → 7.3 → 7.4, 7.5 | Depend on 7.1's `confirmed` flag + nullable shots. 7.2 (drawer lifecycle) before 7.3 (confirm/zero-fill) before 7.4 (tap-to-edit); 7.5 (layout) needs only 7.1. |
| **4 — Players FE & history** | 8.3 → 8.4; 9.1 | 8.3/8.4 depend on 8.2. 9.1 (FE subtext) depends on 9.1-BE; its title-line change (CC-4) depends on 6.2's `name` on `SessionSummary`. |

**Critical-path call-outs:**
- **CC-1 (blocking):** Story 6.1 changes `GET /api/archery/sessions/in-progress` to return an array; three shipped FE call sites consume the old single-object shape. 6.1 must not merge in isolation — land with 6.3/6.4 or include the Task 6 shim.
- **CC-4:** History shows a session's custom `name` only once `SessionSummary` carries `name` (added in Story 6.2 Task 4b) — Story 9.1 Task 3b depends on it.

---

## Epic 6: Multiple Concurrent Sessions & Home Redesign

The app moves from a single in-progress session to multiple concurrent ones. The Archery home screen is redesigned around three standard actions — New Session, Resume, History — with a resume picker scoped to the current UTC day and an editable, date-defaulted session name.

> **Sequencing:** Story 6.1 (backend model) must land before 6.2, 6.3, 6.4. Story 6.1 also touches `schemas/session.py` and `archery_service.py` — coordinate with Story 7.1, which extends the same files (partial targets / zero-fill). Recommended order: 6.1 → 7.1 → remainder.

### Story 6.1: Backend — Concurrent In-Progress Sessions & Session Metadata

As a developer,
I want the backend to persist and manage multiple in-progress sessions, each with a name and date,
So that operators can run several rounds at once and the frontend can list, resume, and finalise any of them.

**Acceptance Criteria:**

1. **Given** the `SessionData` schema, **When** a session is created, **Then** it includes a `name` (str, user-facing) and a `date` (str, `YYYY-MM-DD`) field in addition to the existing `label`; `label` remains the canonical unique id and filename stem.
2. **Given** `session_repo.py`, **When** an in-progress session is written, **Then** it is saved to its own file named `_ip_{label}.json` (underscore-prefixed so it is excluded from history listing), not a single shared `_in_progress.json`.
3. **Given** `session_repo.list_in_progress()`, **When** called, **Then** it returns all `_ip_*.json` sessions as `SessionData`, sorted newest first by `date` then label suffix.
4. **Given** `session_repo.read_in_progress(label)` and `delete_in_progress(label)`, **When** called with a label, **Then** they operate on that specific in-progress file; `delete_in_progress(label)` is idempotent.
5. **Given** `archery_service.create_session(...)`, **When** called, **Then** it no longer raises if another session is in progress — it always creates a new in-progress session with a fresh unique label, the supplied/derived name, and today's date.
6. **Given** `archery_service.finalise_in_progress(label)`, **When** called, **Then** it finalises the specified in-progress session to `{label}.json` and deletes that session's `_ip_{label}.json` (other in-progress sessions are untouched).
7. **Given** the routers, **When** the in-progress endpoints are called, **Then** they accept/return a label: `GET /api/archery/sessions/in-progress` returns an array of in-progress summaries; `GET|PUT|DELETE /api/archery/sessions/in-progress/{label}` and `POST /api/archery/sessions/in-progress/{label}/finalise` target a specific session.
8. **Given** a previously written single `_in_progress.json` file exists, **When** the backend lists in-progress sessions, **Then** it is migrated/treated as an `_ip_{label}.json` session (no data loss) — a one-time read-and-rewrite is acceptable.
9. **Given** all existing tests, **When** the suite runs, **Then** tests are updated to the new multi-session contract and pass.

### Story 6.2: Editable Session Name & Date at Creation

As an operator,
I want to rename a session when I create it (defaulting to the date),
So that I can give memorable names to rounds while still ordering them chronologically.

**Acceptance Criteria:**

1. **Given** the session setup screen, **When** it renders, **Then** a "Session name" input is shown, preloaded with the date (e.g. `2026-05-29`).
2. **Given** the operator edits the name, **When** they confirm the roster, **Then** the entered name is sent to `POST /api/archery/sessions` and stored as the session `name`; if left blank it falls back to the date default.
3. **Given** a session is created, **When** it is persisted, **Then** its `date` field is set to the current UTC date regardless of the chosen name.
4. **Given** the name is displayed in the UI (resume picker, results, history), **When** rendered, **Then** the custom `name` is shown (not the canonical `label`); the auto-suffix display rule (Story 5.1) applies only when the name is still the date-derived default.
5. **Given** the `CreateSessionRequest` schema, **When** it is validated, **Then** it accepts an optional `name` field alongside `archers`.

### Story 6.3: Archery Home Redesign — New Session / Resume / History

As an operator,
I want New Session, Resume, and History as standard buttons on the Archery home screen,
So that I can choose my action directly instead of being forced into a single resume/discard prompt.

**Acceptance Criteria:**

1. **Given** the Archery home screen, **When** it renders, **Then** it shows three primary buttons — **New Session**, **Resume**, **History** — each a ≥44px tap target; the previous persistent resume/discard bottom sheet is removed.
2. **Given** the operator taps **New Session** and no session is in progress, **When** the tap registers, **Then** they go straight to session setup (equivalent to the old "Start Fresh").
3. **Given** at least one session is in progress, **When** the operator taps **New Session**, **Then** a popup appears asking whether to **Delete in-progress session(s)** or **Leave them**; choosing Delete removes all in-progress sessions then proceeds to setup; choosing Leave proceeds to setup leaving them intact.
4. **Given** the operator taps **History**, **When** the tap registers, **Then** they navigate to the history page (unchanged behaviour).
5. **Given** the home screen, **When** it loads, **Then** it queries in-progress sessions once and reflects their presence in the Resume button's visibility (see Story 6.4) without auto-opening any sheet.

### Story 6.4: Resume Picker Scoped to Today

As an operator,
I want to pick which of today's in-progress sessions to resume,
So that I can continue the right round when several are open.

**Acceptance Criteria:**

1. **Given** the Archery home screen, **When** no in-progress session is dated the current UTC day, **Then** the **Resume** button is hidden (FR-6.2).
2. **Given** one or more in-progress sessions are dated the current UTC day, **When** the home screen renders, **Then** the **Resume** button is shown.
3. **Given** the operator taps **Resume**, **When** there is exactly one of today's open sessions, **Then** it resumes directly to the scoring board in exact restored state.
4. **Given** the operator taps **Resume** and there are multiple of today's open sessions, **When** the tap registers, **Then** a picker lists them (name + confirmed-target count) and selecting one resumes it to exact state.
5. **Given** the picker, **When** it lists sessions, **Then** only the current UTC day's in-progress sessions are shown (older open sessions are excluded from Resume but still counted toward the New Session conflict popup).
6. **Given** a resumed session, **When** the scoring board renders, **Then** confirmed targets are green and unconfirmed targets are open — state is server-side and resumable from any LAN device.

---

## Epic 7: Scoring & Score-Entry Overhaul

The scoring board and score-entry drawer are reworked for one-handed field use and flexible editing.

> **Sequencing:** Story 7.1 (backend partial-target/zero-fill model) must land before 7.2, 7.3, 7.5. It extends `schemas/session.py` and `archery_service.py` — land after Story 6.1 to avoid schema churn.

### Story 7.1: Backend — Partial Targets, Confirmed Flag & Zero-Fill

As a developer,
I want in-progress targets to hold partial scores and a confirmed flag, and finalise/results to treat anything unentered as 0,
So that operators can save mid-entry, confirm partial targets, and view results at any time.

**Acceptance Criteria:**

1. **Given** the `TargetScores` schema, **When** an in-progress target is validated, **Then** shot values may be `null` (length-2 list of `int | null`) and a `confirmed: bool` field (default `false`) is present.
2. **Given** an in-progress session, **When** validated, **Then** targets need NOT cover the full roster and shots need NOT be filled — the strict "keys must equal roster / exactly 2 valid shots" rule applies only to `finalised` sessions.
3. **Given** a finalised session is produced (`finalise_in_progress`), **When** it is written, **Then** every target 1–18 is present, every archer has two shots, and all `null`/missing values are coerced to `0`; `confirmed` is irrelevant once finalised.
4. **Given** `archery_service` results/summary computation, **When** totals are computed for an in-progress or finalised session, **Then** missing targets, missing archers, and `null` shots all contribute `0`.
5. **Given** finalised JSON on disk, **When** read back, **Then** it still validates under the strict finalised rules (no nulls, full roster, 18 targets) — back-compatible with Stories 2.1/2.5.
6. **Given** the `PUT /api/archery/sessions/in-progress/{label}` endpoint, **When** it receives a session with partial/`null` shots and `confirmed` flags, **Then** it persists them without error.

### Story 7.2: Score-Entry Drawer Lifecycle

As an operator,
I want the score-entry drawer to stay hidden until I tap a target and to save whenever it closes,
So that the board stays clean and I never lose an entry.

**Acceptance Criteria:**

1. **Given** the scoring board, **When** it first renders, **Then** the score-entry drawer is hidden.
2. **Given** the operator taps a target number, **When** the tap registers, **Then** the drawer opens for that target with any previously entered scores pre-populated.
3. **Given** the drawer is open, **When** the operator taps the **X** (top-right), **Then** the drawer closes and the current entry is saved (partial entries persisted as-is; see Story 7.3 for zero-fill on Confirm).
4. **Given** the drawer is open, **When** the operator taps **Confirm Target**, **Then** the drawer closes and the entry is saved (with zero-fill per Story 7.3).
5. **Given** the entry is saved on close, **When** the save completes, **Then** `PUT /api/archery/sessions/in-progress/{label}` has persisted the target; the discard-guard dialog from Story 2.4 is removed (closing always saves, never discards).
6. **Given** a save fails, **When** the error is surfaced, **Then** the board shows the existing error banner and the entry is not lost from local state.

### Story 7.3: Confirm Target With Partial Entry

As an operator,
I want to confirm a target even if I haven't entered every shot,
So that I can quickly mark a target done and have missing shots count as 0.

**Acceptance Criteria:**

1. **Given** the score-entry drawer, **When** it renders, **Then** **Confirm Target** is always enabled (no longer gated on all shots being filled).
2. **Given** some shots are empty, **When** the operator taps **Confirm Target**, **Then** every empty shot is saved as `0` and the target is marked `confirmed: true`.
3. **Given** a target is confirmed, **When** the board re-renders, **Then** that target icon is green.
4. **Given** a confirmed target is re-opened, **When** the drawer renders, **Then** the previously saved values (including any auto-filled 0s) are shown and editable; re-confirming re-saves.
5. **Given** the confirm action, **When** it persists, **Then** the saved target passes in-progress validation (Story 7.1) — partial 0-filled values are valid in-progress.

### Story 7.4: Direct Tap-to-Edit in Score-Entry Drawer

As an operator,
I want to tap any archer's name or either shot slot to edit it directly,
So that correcting a single value is fast and the "back to name" arrow is unnecessary.

**Acceptance Criteria:**

1. **Given** the drawer's archer chips/list, **When** the operator taps an archer name, **Then** that archer becomes the active entry (jumps directly, forward or backward).
2. **Given** the active archer's two shot slots, **When** the operator taps shot-1 or shot-2, **Then** that slot becomes the active target for the next shot-button press.
3. **Given** a shot slot is selected and a shot-value button is pressed, **When** the press registers, **Then** the value is written to the selected slot (not auto-advanced from slot 0).
4. **Given** the new tap-to-edit model, **When** the drawer renders, **Then** the "← Back to {name}" link is removed.
5. **Given** auto-advance is still desirable for fresh entry, **When** the operator fills shot-1 then shot-2 without manually selecting slots, **Then** entry still advances naturally (shot-1 → shot-2 → next archer) — manual tap selection overrides the cursor.

### Story 7.5: Bottom-Anchored Board Controls & Persistent Results Access

As an operator,
I want the scoring board's controls within thumb reach at the bottom and a results button always available at the top,
So that I can operate one-handed and check standings at any time.

**Acceptance Criteria:**

1. **Given** the scoring board, **When** it renders, **Then** the primary action control(s) are anchored to the bottom of the screen within comfortable thumb reach, ≥44px tall.
2. **Given** the top bar (same layer as the "{n} of 18 confirmed" count), **When** the board renders, **Then** a persistent **View Results** control is present at the top-right at all times — not gated on 18/18 confirmed.
3. **Given** the operator taps the top-right **View Results** at any completion level, **When** the results screen renders, **Then** unentered targets and shots are counted as `0` (per Story 7.1) and rankings reflect that.
4. **Given** the old 18/18-only "View Results" banner, **When** the board renders, **Then** it is removed (superseded by the persistent control) OR retained only as a non-blocking completion confirmation — implementation may keep a subtle "all confirmed" indicator but must not be the only path to results.
5. **Given** a screen width of 360px, **When** the board and its bottom controls render, **Then** there is no horizontal scroll and controls remain reachable without obscuring targets.

---

## Epic 8: Roster Speed & Recurring Players

Roster entry keeps focus in the name field after each add, and a server-side recurring-players list can be picked from when building a session roster.

> **Sequencing:** Story 8.2 (backend store/API) must land before 8.3 and 8.4. Story 8.1 is independent and can land anytime.

### Story 8.1: Keep Focus in Name Field After Add

As an operator,
I want the cursor to stay in the archer-name field after I tap Add,
So that I can enter several archers in a row without re-tapping the field.

**Acceptance Criteria:**

1. **Given** the session setup screen, **When** the operator adds an archer (via the Add button or Enter), **Then** the name input is cleared and keeps/regains keyboard focus.
2. **Given** focus is restored, **When** the operator types immediately, **Then** the next name lands in the input with no extra tap.
3. **Given** an add is rejected (empty or duplicate), **When** the error shows, **Then** focus also remains in the input for correction.

### Story 8.2: Backend — Recurring Players Store & API

As a developer,
I want a server-side recurring-players list behind an API,
So that operators can maintain a reusable roster across devices on the LAN.

**Acceptance Criteria:**

1. **Given** persistence, **When** recurring players are saved, **Then** they are stored in `DATA_DIR/_recurring_players.json` (underscore-prefixed, excluded from history) via the atomic write pattern in `session_repo.py`.
2. **Given** the repository layer, **When** `read_recurring_players()` / `write_recurring_players(names)` are called, **Then** they handle file-absent (returns empty list) and write atomically; no `HTTPException` raised in the repo.
3. **Given** `GET /api/archery/players`, **When** called, **Then** it returns a direct JSON array of recurring player names.
4. **Given** `POST /api/archery/players` with a name, **When** called, **Then** the name is added (trimmed, non-empty, de-duplicated case-sensitively per existing roster rules) and the updated list returned; adding a duplicate is a no-op success.
5. **Given** `DELETE /api/archery/players/{name}`, **When** called, **Then** the name is removed if present; idempotent.
6. **Given** the service layer, **When** it mediates these calls, **Then** validation lives in `archery_service.py` and file I/O only in `session_repo.py` (layering preserved).

### Story 8.3: Recurring Players Management UI

As an operator,
I want to manage my list of recurring players from the Archery home screen,
So that I can curate the names that appear when building a roster.

**Acceptance Criteria:**

1. **Given** the Archery home screen, **When** it renders, **Then** there is an entry point (button) to a recurring-players management view.
2. **Given** the management view, **When** it loads, **Then** it lists current recurring players (from `GET /api/archery/players`) with a way to remove each (≥44px targets).
3. **Given** the management view, **When** the operator enters a name and adds it, **Then** `POST /api/archery/players` is called and the list updates; empty/duplicate handled with feedback.
4. **Given** the operator removes a player, **When** confirmed, **Then** `DELETE /api/archery/players/{name}` is called and the list updates.
5. **Given** a dedicated Pinia store (`useRecurringPlayersStore`), **When** actions run, **Then** they expose `loading`/`error` and use a `finally` block; all HTTP goes through `useApi.ts`.

### Story 8.4: Pick Recurring Players in Session Setup

As an operator,
I want to add recurring players to a new session's roster from a picker,
So that I can build a roster quickly without retyping familiar names.

**Acceptance Criteria:**

1. **Given** the session setup screen, **When** it renders, **Then** the free-text custom-name input remains, plus a control to pick from recurring players.
2. **Given** the operator opens the recurring-players picker, **When** it loads, **Then** it lists recurring players not already in the draft roster.
3. **Given** the operator selects a recurring player, **When** the selection registers, **Then** that name is added to the draft roster (same uniqueness rules as typed names).
4. **Given** a recurring player already in the roster, **When** the picker renders, **Then** it is hidden or disabled to prevent duplicates.
5. **Given** no recurring players exist, **When** the picker is opened, **Then** an empty state points the operator to the management view (Story 8.3).

---

## Epic 9: History Enrichment & App Iconography

History entries surface the top 3 archers and their scores, and the Archery app icon becomes a thematic monochrome glyph.

### Story 9.1: History Subtext — Top 3 Archers

As an operator,
I want each history entry to show the top 3 archers and their scores,
So that I can recall a round's standings at a glance without opening it.

**Acceptance Criteria:**

1. **Given** the `SessionSummary` schema, **When** a summary is produced, **Then** it includes a `top_archers` field: an ordered list (max 3) of `{ name, score }`, highest first, using the existing tie-break (score desc, then case-insensitive name).
2. **Given** `archery_service._summarise`, **When** it computes a summary, **Then** `top_archers` holds up to the first 3 ranked archers; sessions with fewer than 3 archers list only those present.
3. **Given** `GET /api/archery/sessions`, **When** called, **Then** each row includes `top_archers`; existing `winner`/`winning_score` remain for back-compatibility (winner == top_archers[0]).
4. **Given** `HistoryListItem.vue`, **When** a row renders, **Then** the subtext shows the top 3 as `Name (score)` separated clearly (e.g. `Alice 372 · Bob 350 · Cara 318`) instead of only the winner; the `aria-label` is updated accordingly.
5. **Given** the frontend `SessionSummary` type, **When** updated, **Then** it includes `top_archers`; existing specs are updated to the new subtext.

### Story 9.2: Thematic Monochrome App Icon

As an operator,
I want the Archery app's icon to be a thematic target/bow glyph in a single colour,
So that the app reads clearly and on-theme on the shell landing page.

**Acceptance Criteria:**

1. **Given** `src/apps/registry.ts`, **When** the archery entry is defined, **Then** its `icon` is a thematic Material Icons glyph (e.g. `my_location` / `gps_fixed` target reticle, or `adjust`) rather than `sports_score`.
2. **Given** the shell landing page, **When** the Archery `AppCard` renders, **Then** the icon is displayed monochrome (single theme colour, no multi-tone).
3. **Given** the chosen icon, **When** reviewed, **Then** it is recognisably archery/target-themed and legible at the card's icon size.
4. **Given** the change is icon-only, **When** implemented, **Then** no other registry fields or routes change.
