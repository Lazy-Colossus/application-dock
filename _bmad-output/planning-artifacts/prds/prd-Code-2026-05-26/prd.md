---
title: Multi-App Platform — Archery Score Counter (v1)
status: final
created: 2026-05-26
updated: 2026-05-26
---

## 1. Vision & Problem Statement

A lightweight, phone-friendly web platform that hosts small utility apps for personal use. The first app solves a specific friction point: tracking archery scores across 18 targets for a group of friends during informal field archery rounds, then reviewing history across sessions.

No native install required. Open in a phone browser, run a session, close it. Results persist as files on the host.

---

## 2. Users & Context

| Aspect | Detail |
|--------|--------|
| Primary user | One operator per session (holds the phone, enters scores for the group) |
| Group size | 2–8 archers per session (no hard limit in v1) |
| Context | Outdoors at an informal field archery course |
| Technical comfort | Casual; UI must be large-tap-target friendly with no onboarding |

---

## 3. Features

### F1 — Multi-App Shell

**FR-1.1** The landing page displays a navigation menu listing available apps as large, tappable cards.  
**FR-1.2** The shell is extensible: adding a new app requires only registering it in the menu — no changes to existing apps.  
**FR-1.3** A persistent home control is accessible from every screen inside any app.

---

### F2 — Archery Score Counter

#### F2.1 — Session Setup

**FR-2.1** The operator starts a new session from the Archery app home screen.  
**FR-2.2** Archer names are entered one at a time; minimum 1. Names must be non-empty and unique within the session.  
**FR-2.3** The operator confirms the roster and proceeds to the scoring board. The roster cannot be edited mid-session.  
**FR-2.4** Each session is assigned an auto-generated label at creation time: `YYYY-MM-DD` for the first session of that calendar day; `YYYY-MM-DD #2`, `#3`, etc. for subsequent sessions on the same day.

#### F2.2 — Score Entry

**FR-2.5** The scoring board displays 18 target icons numbered 1–18.  
**FR-2.6** Targets may be entered in any order. Tapping a target opens a score-entry panel for that target.  
**FR-2.7** The score-entry panel cycles through each archer in roster order. For each archer, the operator enters two shots sequentially.  
**FR-2.8** Valid shot values are `0`, `5`, `8`, `10`, `11`. Each is presented as a large tap button — no free-text input.  
**FR-2.9** The `11` button is visually distinguished (e.g. gold highlight) as a bullseye indicator. No other special logic applies to this value.  
**FR-2.10** Within the score-entry panel, the operator may navigate back to a previous archer to correct an entry before confirming the target.  
**FR-2.11** When all archers have both shots entered, the operator confirms the target. The target icon on the board turns green.  
**FR-2.12** A confirmed target can be reopened to correct scores at any point before session finalisation. Re-opening resets its green state until re-confirmed.

#### F2.3 — Session Results

**FR-2.13** When all 18 targets are green, a "View Results" prompt appears. It is non-blocking — the operator can still revisit targets.  
**FR-2.14** The results screen shows each archer's name and total score (sum of all shots across all targets; max 396), ranked highest to lowest.  
**FR-2.15** The results screen includes a per-archer, per-target breakdown as a scrollable table: target number → shot 1, shot 2, subtotal.  
**FR-2.16** From the results screen, the operator can finalise the session (writes to persistent storage) or return to correct scores.  
**FR-2.17** Finalising returns to the Archery app home screen.

#### F2.4 — Session History

**FR-2.18** The Archery app home screen has a History entry point listing all saved sessions, newest first.  
**FR-2.19** Each history entry displays: session label, archer count, winner name, and winning score.  
**FR-2.20** Tapping a history entry opens the full read-only results view for that session (same layout as FR-2.14/FR-2.15).  
**FR-2.21** History is append-only in v1 — sessions are not deletable or editable after finalisation.

---

## 4. Data & Persistence

**FR-3.1** No database. All session data is stored as JSON files on the server filesystem.  
**FR-3.2** One file per session. File naming: `YYYY-MM-DD.json`, `YYYY-MM-DD-2.json`, etc., mirroring the session label.  
**FR-3.3** JSON schema per session: session label, created timestamp, ordered archer roster, and for each target: target number and per-archer shot values (two per archer).  
**FR-3.4** Files are stored in a configurable directory via env var `DATA_DIR`, defaulting to `/data` inside the container, mounted as a Docker volume so data survives container restarts.  
**FR-3.5** In-progress sessions are auto-saved to a temp file on the BE after every archer's two shots are confirmed. The temp file shares the finalised session schema plus a `status: in_progress` field.  
**FR-3.6** On loading the Archery app, the BE checks for an existing temp file. If found, the user is offered the choice to resume or discard and start fresh.  
**FR-3.7** On resume, the board is restored to exact state — completed targets green, remaining targets open. Any device that can reach the server may resume (state is server-side, not browser-local).  
**FR-3.8** Only one in-progress session exists at a time. On finalisation the temp file is replaced by the permanent session file; on discard it is deleted.

---

## 5. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Responsive layout works on phones (≥ 360 px wide) and desktop browsers without separate builds |
| NFR-2 | All interactive tap targets ≥ 44 px height/width (WCAG touch target guidance) |
| NFR-3 | No user accounts, no auth, no network dependency beyond the local Docker host |
| NFR-4 | Initial page load ≤ 3 s on a local network (LAN / hotspot) |
| NFR-5 | The full stack runs via a single `docker compose up` with no manual build steps |

---

## 6. Technical Constraints

| Constraint | Decision | Rationale |
|------------|----------|-----------|
| Backend | Python — FastAPI | Stated requirement |
| Frontend | Vue 3 + Quasar | Responsive/mobile-first out of the box; no separate mobile build pipeline |
| Persistence | JSON files on host filesystem | No DB; data volume is small (a few KB per session) |
| Deployment | Single `docker-compose.yml` | Stated requirement |
| FE delivery | SPA built as static assets, served by the BE container | One service, one port — simplest Compose; can split to nginx sidecar later |

---

## 7. Out of Scope (v1)

- User accounts, auth, or multi-device sync
- Real-time concurrent entry (each archer on their own device)
- Export (PDF, CSV)
- History filtering, editing, or deletion
- Push notifications
- Any app beyond Archery Score Counter
- Native mobile app / PWA manifest
