---
stepsCompleted: [1, 2, 3, 4]
status: complete
completedAt: '2026-05-28'
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-Code-2026-05-26/prd.md
  - _bmad-output/planning-artifacts/architecture.md
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
