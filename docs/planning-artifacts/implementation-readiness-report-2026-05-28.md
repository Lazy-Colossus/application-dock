---
stepsCompleted: ["step-01-document-discovery", "step-02-prd-analysis", "step-03-epic-coverage-validation", "step-04-ux-alignment", "step-05-epic-quality-review", "step-06-final-assessment"]
documentsInScope:
  prd: "docs/planning-artifacts/prds/prd-Code-2026-05-26/prd.md"
  architecture: "docs/planning-artifacts/architecture.md"
  epics: "docs/planning-artifacts/epics.md"
  ux: null
---

# Implementation Readiness Assessment Report

**Date:** 2026-05-28
**Project:** Code (Application Dock)

## Document Inventory

### PRD Documents

**Sharded Documents:**
- Folder: `prds/prd-Code-2026-05-26/`
  - `prd.md` (6,862 bytes, modified 2026-05-26)

### Architecture Documents

**Whole Documents:**
- `architecture.md` (26,856 bytes, modified 2026-05-28)

### Epics & Stories Documents

**Whole Documents:**
- `epics.md` (25,066 bytes, modified 2026-05-28)

### UX Design Documents

*(None found)*

---

## PRD Analysis

### Functional Requirements

**F1 — Multi-App Shell**

FR-1.1: The landing page displays a navigation menu listing available apps as large, tappable cards.
FR-1.2: The shell is extensible: adding a new app requires only registering it in the menu — no changes to existing apps.
FR-1.3: A persistent home control is accessible from every screen inside any app.

**F2.1 — Session Setup**

FR-2.1: The operator starts a new session from the Archery app home screen.
FR-2.2: Archer names are entered one at a time; minimum 1. Names must be non-empty and unique within the session.
FR-2.3: The operator confirms the roster and proceeds to the scoring board. The roster cannot be edited mid-session.
FR-2.4: Each session is assigned an auto-generated label at creation time: `YYYY-MM-DD` for the first session of that calendar day; `YYYY-MM-DD #2`, `#3`, etc. for subsequent sessions on the same day.

**F2.2 — Score Entry**

FR-2.5: The scoring board displays 18 target icons numbered 1–18.
FR-2.6: Targets may be entered in any order. Tapping a target opens a score-entry panel for that target.
FR-2.7: The score-entry panel cycles through each archer in roster order. For each archer, the operator enters two shots sequentially.
FR-2.8: Valid shot values are `0`, `5`, `8`, `10`, `11`. Each is presented as a large tap button — no free-text input.
FR-2.9: The `11` button is visually distinguished (e.g. gold highlight) as a bullseye indicator. No other special logic applies to this value.
FR-2.10: Within the score-entry panel, the operator may navigate back to a previous archer to correct an entry before confirming the target.
FR-2.11: When all archers have both shots entered, the operator confirms the target. The target icon on the board turns green.
FR-2.12: A confirmed target can be reopened to correct scores at any point before session finalisation. Re-opening resets its green state until re-confirmed.

**F2.3 — Session Results**

FR-2.13: When all 18 targets are green, a "View Results" prompt appears. It is non-blocking — the operator can still revisit targets.
FR-2.14: The results screen shows each archer's name and total score (sum of all shots across all targets; max 396), ranked highest to lowest.
FR-2.15: The results screen includes a per-archer, per-target breakdown as a scrollable table: target number → shot 1, shot 2, subtotal.
FR-2.16: From the results screen, the operator can finalise the session (writes to persistent storage) or return to correct scores.
FR-2.17: Finalising returns to the Archery app home screen.

**F2.4 — Session History**

FR-2.18: The Archery app home screen has a History entry point listing all saved sessions, newest first.
FR-2.19: Each history entry displays: session label, archer count, winner name, and winning score.
FR-2.20: Tapping a history entry opens the full read-only results view for that session (same layout as FR-2.14/FR-2.15).
FR-2.21: History is append-only in v1 — sessions are not deletable or editable after finalisation.

**F3 — Data & Persistence**

FR-3.1: No database. All session data is stored as JSON files on the server filesystem.
FR-3.2: One file per session. File naming: `YYYY-MM-DD.json`, `YYYY-MM-DD-2.json`, etc., mirroring the session label.
FR-3.3: JSON schema per session: session label, created timestamp, ordered archer roster, and for each target: target number and per-archer shot values (two per archer).
FR-3.4: Files are stored in a configurable directory via env var `DATA_DIR`, defaulting to `/data` inside the container, mounted as a Docker volume so data survives container restarts.
FR-3.5: In-progress sessions are auto-saved to a temp file on the BE after every archer's two shots are confirmed. The temp file shares the finalised session schema plus a `status: in_progress` field.
FR-3.6: On loading the Archery app, the BE checks for an existing temp file. If found, the user is offered the choice to resume or discard and start fresh.
FR-3.7: On resume, the board is restored to exact state — completed targets green, remaining targets open. Any device that can reach the server may resume (state is server-side, not browser-local).
FR-3.8: Only one in-progress session exists at a time. On finalisation the temp file is replaced by the permanent session file; on discard it is deleted.

**Total FRs: 32**

---

### Non-Functional Requirements

NFR-1: Responsive layout works on phones (≥ 360 px wide) and desktop browsers without separate builds.
NFR-2: All interactive tap targets ≥ 44 px height/width (WCAG touch target guidance).
NFR-3: No user accounts, no auth, no network dependency beyond the local Docker host.
NFR-4: Initial page load ≤ 3 s on a local network (LAN / hotspot).
NFR-5: The full stack runs via a single `docker compose up` with no manual build steps.

**Total NFRs: 5**

---

### Additional Requirements (Technical Constraints)

TC-1: Backend — Python FastAPI (stated requirement).
TC-2: Frontend — Vue 3 + Quasar (responsive/mobile-first; no separate mobile build pipeline).
TC-3: Persistence — JSON files on host filesystem (no DB; small data volume).
TC-4: Deployment — Single `docker-compose.yml`.
TC-5: FE delivery — SPA built as static assets, served by the BE container (one service, one port).

---

---

## Epic Coverage Validation

### Coverage Matrix

| FR Number | PRD Requirement (summary) | Epic Coverage | Story | Status |
|-----------|--------------------------|---------------|-------|--------|
| FR-1.1 | Landing page: large tappable app cards | Epic 1 | Story 1.2 | ✓ Covered |
| FR-1.2 | Shell extensibility via registry.ts | Epic 1 | Story 1.2 | ✓ Covered |
| FR-1.3 | Persistent home control on every screen | Epic 1 | Story 1.2 | ✓ Covered |
| FR-2.1 | Operator starts new session from Archery home | Epic 2 | Story 2.1 | ✓ Covered |
| FR-2.2 | Archer name entry — min 1, non-empty, unique | Epic 2 | Story 2.1 | ✓ Covered |
| FR-2.3 | Roster confirmation; roster locked mid-session | Epic 2 | Story 2.1 | ✓ Covered |
| FR-2.4 | Auto-generated session label (YYYY-MM-DD, #2…) | Epic 2 | Story 2.1 | ✓ Covered |
| FR-2.5 | Scoring board: 18 numbered target icons | Epic 2 | Story 2.3 | ✓ Covered |
| FR-2.6 | Any-order target selection; opens score panel | Epic 2 | Story 2.3 | ✓ Covered |
| FR-2.7 | Score panel cycles archers; two shots each | Epic 2 | Story 2.4 | ✓ Covered |
| FR-2.8 | Shot values 0/5/8/10/11 as large tap buttons | Epic 2 | Story 2.4 | ✓ Covered |
| FR-2.9 | 11 button gold-highlighted as bullseye | Epic 2 | Story 2.4 | ✓ Covered |
| FR-2.10 | Back-navigation within score entry panel | Epic 2 | Story 2.4 | ✓ Covered |
| FR-2.11 | Target confirmed → icon turns green | Epic 2 | Story 2.4 | ✓ Covered |
| FR-2.12 | Reopen confirmed target; green state resets | Epic 2 | Story 2.3 / 2.4 | ✓ Covered |
| FR-2.13 | Non-blocking "View Results" at 18/18 green | Epic 2 | Story 2.5 | ✓ Covered |
| FR-2.14 | Results: ranked totals per archer (max 396) | Epic 2 | Story 2.5 | ✓ Covered |
| FR-2.15 | Results: per-archer per-target breakdown table | Epic 2 | Story 2.5 | ✓ Covered |
| FR-2.16 | Finalise or return to scoring from results | Epic 2 | Story 2.5 | ✓ Covered |
| FR-2.17 | Finalise returns to Archery home | Epic 2 | Story 2.5 | ✓ Covered |
| FR-2.18 | History list on Archery home, newest first | Epic 4 | Story 4.1 | ✓ Covered |
| FR-2.19 | History entry: label, archer count, winner, score | Epic 4 | Story 4.1 | ✓ Covered |
| FR-2.20 | Tap history entry → read-only results view | Epic 4 | Story 4.2 | ✓ Covered |
| FR-2.21 | History append-only; no delete/edit | Epic 4 | Story 4.2 | ✓ Covered |
| FR-3.1 | No database; JSON files on server filesystem | Epic 2 | Story 2.2 | ✓ Covered |
| FR-3.2 | File naming mirrors session label | Epic 2 | Story 2.2 / 2.5 | ✓ Covered |
| FR-3.3 | JSON schema: label, timestamp, roster, shot values | Epic 2 | Story 2.2 | ✓ Covered |
| FR-3.4 | DATA_DIR env var; Docker volume; defaults to /data | Epic 2 | Story 1.1 / 2.2 | ✓ Covered |
| FR-3.5 | Auto-save to temp file after each confirmed target | Epic 3 | Story 3.1 | ✓ Covered |
| FR-3.6 | Resume/discard prompt on app load if temp file exists | Epic 3 | Story 3.2 | ✓ Covered |
| FR-3.7 | Full board state restored on resume; any LAN device | Epic 3 | Story 3.2 | ✓ Covered |
| FR-3.8 | Single in-progress session; replace on finalise, delete on discard | Epic 3 | Story 3.1 / 3.2 | ✓ Covered |

### Missing Requirements

**None.** All 32 FRs have explicit coverage in epics and stories.

### Coverage Statistics

- Total PRD FRs: 32
- FRs covered in epics: 32
- Coverage percentage: **100%**

---

### PRD Completeness Assessment

The PRD is clear, well-structured, and provides specific, testable requirements. All features are numbered and traceable. Session labelling logic (FR-2.4/FR-3.2) is precise. The resume/discard flow (FR-3.6/FR-3.7) is explicitly scoped. Out-of-scope items are documented. No UX/design document exists, which will limit visual specification validation.

---

## UX Alignment Assessment

### UX Document Status

**Not Found.** No separate UX design document exists. The epics document explicitly notes this. This is a user-facing, mobile-first web application — UX is strongly implied by the PRD.

### UX Coverage via PRD & Architecture

The PRD embeds significant UX specification inline:
- **NFR-1**: Responsive layout ≥360px wide, no separate builds
- **NFR-2**: All tap targets ≥44px (WCAG touch guidance)
- **FR-2.8**: Large tap buttons for shot values — no free-text input
- **FR-2.9**: Gold highlight on the `11` bullseye button
- **FR-2.5**: 18 numbered target icons on the scoring board
- **FR-2.10**: Back-navigation within score entry panel
- **FR-2.11/2.12**: Green state on confirmed targets; resets on reopen
- **FR-2.13**: Non-blocking "View Results" prompt

The Architecture document addresses these via:
- Quasar component library (mobile-first, ≥44px tap targets by default)
- Vue Router history mode for SPA navigation
- Feature-based component folders (`src/apps/archery/pages/`, `components/`)
- Shared primitives in `src/components/` (e.g. `AppCard`)

### Alignment Issues

No conflicts between PRD UX requirements and Architecture decisions.

### Warnings

⚠️ **WARNING — No Dedicated UX Document:** This is a user-facing mobile-first application without a wireframe, mockup, or UX flow document. The following interactions are underspecified at visual/interaction level:
1. **Score Entry Panel layout** — no wireframe for the two-shot-per-archer cycling flow; how "Back" is presented vs "Confirm Target" is unspecified beyond functional description
2. **Scoring board grid layout** — 18 icons at 360px width; no defined grid (3×6? 2×9?); Quasar grid behaviour assumed but unvalidated
3. **Results table layout** — scrollable per-archer per-target table on mobile; row/column density unspecified
4. **Resume/Discard prompt** — modal, banner, or page? Not specified
5. **History list vs Home screen layout** — how "New Session" and "History" coexist on the Archery home screen is unspecified

**Impact:** Low-to-medium. The PRD provides enough functional specification to build correctly; however, implementation may produce a UI that is functionally correct but UX-suboptimal. Developers will make layout judgement calls without design guidance.

**Recommendation:** Acceptable for v1 personal-use tool. Developers should use Quasar defaults and document any non-obvious layout choices.

---

## Epic Quality Review

### Best Practices Compliance Checklist

| Epic | User Value | Independently Deliverable | Stories Sized Well | No Forward Dependencies | Clear ACs | FR Traceability |
|------|-----------|--------------------------|-------------------|------------------------|-----------|-----------------|
| Epic 1: Platform Foundation & Shell | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Epic 2: Archery Score Session | ✓ | ✓ (needs Epic 1) | ✓ | ⚠️ See below | ✓ | ✓ |
| Epic 3: Session Continuity | ✓ | ✓ (needs Epic 2) | ✓ | ✓ | ✓ | ✓ |
| Epic 4: Session History | ✓ | ✓ (needs Epic 2) | ✓ | ✓ | ✓ | ✓ |

---

### 🔴 Critical Violations

**None found.**

---

### 🟠 Major Issues

#### Issue M-1: Story 2.2 (Data Model & Repository) is ordered AFTER Story 2.1, but Story 2.1 depends on it

**Location:** Epic 2, Stories 2.1 and 2.2

**The Problem:** Story 2.1 (Session Setup — Roster Entry) contains this acceptance criterion:
> *"Given a new session is created, When `POST /api/archery/sessions` is called, Then it returns the session object including an auto-generated label..."*

Implementing this AC requires the `SessionData` Pydantic schema and `session_repo.py` — both defined in Story 2.2. A developer picking up Story 2.1 first cannot implement the backend endpoint without the data model from Story 2.2.

**Impact:** The two stories cannot actually be implemented independently in their listed order. A developer following the story sequence will hit a blocker at Story 2.1's backend AC.

**Recommendation:** Reorder Story 2.2 before Story 2.1 within Epic 2. The data model and repository are prerequisite infrastructure for all other Epic 2 stories — it should be Story 2.1, and session setup becomes Story 2.2.

---

### 🟡 Minor Concerns

#### Concern m-1: Story 2.2 is a developer/technical story, not a user story

**Location:** Story 2.2 — "As a developer, I want a validated session data model and file repository..."

**Detail:** This does not deliver user value directly. However, it has precise, testable ACs and is a well-understood pattern for foundational data layer work. It is acceptable practice in greenfield projects.

**Recommendation:** Acceptable as-is. If preferred, reframe as: "As an operator, I want session data to be reliably saved and retrieved, so that I never lose scoring data due to a system error" — though this may over-stretch the story.

#### Concern m-2: Story 1.1 is a developer/technical story, not a user story

**Location:** Story 1.1 — "As a developer, I want a fully scaffolded project..."

**Detail:** Infrastructure setup story. This is explicitly expected and acceptable for the initial story of a greenfield project (verified against Section 5B of this review step — the starter template requirement). Well-formed ACs, no issues.

**Recommendation:** No action required.

#### Concern m-3: FR-3.4 coverage attribution is split across Epics 1 and 2

**Location:** FR Coverage Map lists FR-3.4 under Epic 2, but the actual implementation (DATA_DIR in `core/config.py`) is in Story 1.1 (Epic 1).

**Detail:** Not a functional gap — FR-3.4 is implemented. Story 1.1's ACs explicitly cover: *"Given `DATA_DIR` env var is set, Then it is read by `app/core/config.py`; if unset, it defaults to `/data`."* The FR Coverage Map simply has the wrong Epic attribution for FR-3.4.

**Recommendation:** Update the FR Coverage Map to show FR-3.4 covered in Epic 1 (Story 1.1), not Epic 2.

#### Concern m-4: Epic 1 title contains "Foundation" — mildly technical framing

**Detail:** "Platform Foundation & Shell" — the word "Foundation" leans technical. The user value is clear in the goal description ("Users can open the app in a browser and navigate to any registered app"), so this is low risk.

**Recommendation:** Optional rename to "App Shell & Navigation" for purity. Not a blocking concern.

---

### Epic Independence Validation

| Dependency | Valid? | Reason |
|-----------|--------|--------|
| Epic 2 → Epic 1 | ✓ | Epic 1 provides the shell/scaffold needed to host Epic 2 |
| Epic 3 → Epic 2 | ✓ | Epic 3 auto-saves sessions created by Epic 2 |
| Epic 4 → Epic 2 | ✓ | Epic 4 reads finalised sessions written by Epic 2 |
| Epic 3 → Epic 4 | ✗ (no dependency) | Epic 3 is not gated on history features |
| Epic 4 → Epic 3 | ✗ (no dependency) | History works with finalised sessions; auto-save is additive |

Epic 3 and Epic 4 are independent of each other — either can be implemented after Epic 2.

### Story Dependency Map

| Story | Depends On | Valid? |
|-------|-----------|--------|
| 1.1 | None | ✓ |
| 1.2 | 1.1 (needs scaffold) | ✓ |
| 2.1 | 1.1, 1.2 (Epic 1 complete) | ✓ |
| **2.2** | **Implicitly required BY 2.1** | **⚠️ See M-1** |
| 2.3 | 2.1, 2.2 | ✓ |
| 2.4 | 2.1, 2.2, 2.3 | ✓ |
| 2.5 | 2.1–2.4 | ✓ |
| 3.1 | Epic 2 complete | ✓ |
| 3.2 | 3.1 | ✓ |
| 4.1 | Epic 2 complete | ✓ |
| 4.2 | 4.1 | ✓ |

### Acceptance Criteria Quality Summary

All stories use proper Given/When/Then BDD format. ACs cover:
- Happy path ✓
- Error conditions (duplicate names, empty names, 404 on missing sessions) ✓
- Edge cases (re-open confirmed target, label suffix for same-day sessions, no in-progress file) ✓
- Non-functional constraints (≥44px tap targets, 360px responsive) ✓
- API contracts (endpoints, response shapes, HTTP status codes) ✓

No vague criteria found. No missing error handling for defined flows.

---

## Summary and Recommendations

### Overall Readiness Status

**READY — with one recommended fix before implementation begins**

The planning artifacts are high-quality, internally consistent, and well-scoped. All 32 functional requirements are traceable to stories. The architecture is coherent and technology decisions are finalized. No blocking issues prevent implementation — but one story ordering problem should be fixed first to avoid developer confusion.

---

### Issues Summary

| ID | Severity | Location | Description |
|----|----------|----------|-------------|
| M-1 | 🟠 Major | Epic 2: Stories 2.1 / 2.2 | Story 2.2 (Data Model) is ordered after Story 2.1, but Story 2.1 depends on it |
| m-1 | 🟡 Minor | Story 2.2 | Developer story with no direct user value framing |
| m-2 | 🟡 Minor | Story 1.1 | Developer story — acceptable for greenfield project setup |
| m-3 | 🟡 Minor | FR Coverage Map | FR-3.4 attributed to Epic 2, but implemented in Story 1.1 (Epic 1) |
| m-4 | 🟡 Minor | Epic 1 title | "Foundation" is mildly technical |
| W-1 | ⚠️ Warning | UX | No UX design document for a mobile-first UI app; 5 interaction patterns underspecified |

Total: **1 major issue, 4 minor concerns, 1 warning**

---

### Critical Issues Requiring Immediate Action

1. **Fix Story 2.2 ordering in Epic 2** — Move Story 2.2 (Session Data Model & Repository) to be the first story in Epic 2, before Story 2.1 (Session Setup — Roster Entry). Story 2.1 cannot be fully implemented without the Pydantic session schema and repository layer that Story 2.2 defines. The current ordering will cause a developer to hit a blocker on Story 2.1's backend ACs.

---

### Recommended Next Steps

1. **Immediately:** Reorder Epic 2 stories so Story 2.2 (Data Model & Repository) precedes Story 2.1 (Session Setup — Roster Entry). This is a simple document edit, not a requirements change.

2. **Before implementation:** Correct the FR Coverage Map — change FR-3.4 attribution from Epic 2 to Epic 1 (Story 1.1). This keeps the traceability map accurate.

3. **Optional (before implementation):** For the 5 underspecified UX interaction patterns (score entry panel layout, scoring board grid, results table, resume/discard prompt style, Archery home screen layout) — either accept that developers will use Quasar defaults and make judgement calls, or add brief interaction notes in the relevant story ACs.

4. **Proceed to implementation** via `bmad-dev-story` once the story reordering is done. Start with Story 1.1.

---

### Final Note

This assessment identified **6 issues** across **3 categories** (ordering, coverage attribution, missing UX docs). None prevent implementation if addressed. The reordering fix (Issue M-1) takes under 5 minutes and eliminates the only meaningful developer confusion risk. The planning artifacts are otherwise thorough, with precise BDD acceptance criteria, 100% FR coverage, clear architecture, and a well-scoped v1 product.

---

*Assessment completed: 2026-05-28*
*Assessor: Implementation Readiness Validator (BMad)*
*Report file: `docs/planning-artifacts/implementation-readiness-report-2026-05-28.md`*
