---
stepsCompleted: [1, 2, 3, 4, 5, 6]
status: complete
verdict: READY FOR IMPLEMENTATION
inputDocuments:
  - docs/planning-artifacts/prds/prd-application-dock-2026-06-10/prd.md
  - docs/planning-artifacts/architectures/architecture-application-dock-2026-06-12/architecture.md
  - docs/planning-artifacts/ux-designs/ux-application-dock-2026-06-10/DESIGN.md
  - docs/planning-artifacts/ux-designs/ux-application-dock-2026-06-10/EXPERIENCE.md
  - docs/planning-artifacts/epics-hotaru.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-06-15
**Project:** Hotaru (Japanese Vocabulary) — app within Application Dock

## Document Inventory

**Assessment scope: the Hotaru artifact set** (the platform/archery artifacts coexist in the same folder but are a *different app* and are excluded from this assessment — not duplicates).

| Type | Selected (Hotaru) | Excluded (archery/platform) |
|------|-------------------|------------------------------|
| PRD | `prds/prd-application-dock-2026-06-10/prd.md` (final) | `prds/prd-Code-2026-05-26/` |
| Architecture | `architectures/architecture-application-dock-2026-06-12/architecture.md` (complete) | `architecture.md` |
| Epics & Stories | `epics-hotaru.md` (3 epics, 18 stories) | `epics.md` |
| UX | `ux-designs/ux-application-dock-2026-06-10/` — `DESIGN.md` + `EXPERIENCE.md` (final) | `ux-designs/ux-Code-2026-05-28/` |

**Duplicates (whole + sharded of the same doc):** none.
**Missing required documents:** none — PRD, Architecture, Epics, and UX all present.

## PRD Analysis

### Functional Requirements (24)
- **F1 Identity:** FR-1 app registered in shell · FR-2 user identity selection/switching (2 hardcoded users, scoped state).
- **F2 Library/Org:** FR-3 shared master vocab list · FR-4 Word record · FR-5 organize by Lesson · FR-6 create/assign shared Topics · FR-7 shared/private words · FR-8 manual entry · FR-9 Genki seed.
- **F3 Practice:** FR-10 picker · FR-11 pre-session overview · FR-12 flashcard flow · FR-13 direction toggle · FR-14 scoring mode (self/typed) · FR-15 grade→familiarity · FR-16 attach note mid-session · FR-17 session summary · FR-18 calm bounds.
- **F4 SRS/Familiarity:** FR-19 automatic scheduling · FR-20 familiarity model (5 tiers) · FR-21 familiarity display.
- **F5 Notes:** FR-22 create notes · FR-23 visibility (set+flip) · FR-24 partner sees shared notes (incl. mid-drill).
**Total FRs: 24.**

### Non-Functional Requirements (8)
NFR-1 mobile-only phone web · NFR-2 per-user privacy isolation (private words/notes; path boundary) · NFR-3 no auth · NFR-4 JSON-on-disk, atomic writes, no DB · NFR-5 calm guardrail / queue-not-debt · NFR-6 performance (in-memory ≤5k, optimistic grading) · NFR-7 accessibility (icon+label+colour, reduced-motion) · NFR-8 platform conformance (3-layer, useApi, registry, Pinia, JSON contract).
**Total NFRs: 8.**

### Additional Requirements / Constraints (from PRD)
- **Non-goals (permanent):** no competitive/coercive mechanics ever (no streaks/leaderboards/due-debt); no listening/audio v1; no AI behaviour v1 (Phase II); no grammar/kanji practice v1 (Phase III); exactly 2 users (no self-management); no always-on/background mode.
- **Architect-for-AI:** optional word fields + a service seam are anticipated, but v1 ships no AI fields/code.
- **Genki seed** comes from an offline pipeline (project step one), outside the app.

### PRD Completeness Assessment
PRD is **final**, internally consistent, and rigorously scoped (Glossary-anchored, FRs with testable consequences, explicit Non-Goals, MVP phases, success metrics + counter-metric, assumptions index). Requirements are clear and traceable — suitable basis for coverage validation.

## Epic Coverage Validation

### Coverage Matrix (FR → Story)
| FR | Requirement | Story | Status |
|----|-------------|-------|--------|
| FR-1 | App registered in shell | 1.2 | ✓ |
| FR-2 | User identity selection/switch | 1.3 | ✓ |
| FR-3 | Shared master vocab list | 1.4 | ✓ |
| FR-4 | Word record | 1.4 / 1.5 | ✓ |
| FR-5 | Organize by Lesson | 1.4 | ✓ |
| FR-6 | Create/assign shared Topics | 1.7 | ✓ |
| FR-7 | Shared vs private words | 1.6 | ✓ |
| FR-8 | Manual word entry | 1.5 | ✓ |
| FR-9 | Genki seed | 1.1 / 1.4 | ✓ |
| FR-10 | Activity & scope picker | 2.2 | ✓ |
| FR-11 | Pre-session overview | 2.2 | ✓ |
| FR-12 | Flashcard flow | 2.3 | ✓ |
| FR-13 | Direction toggle | 2.4 | ✓ |
| FR-14 | Scoring mode (self/typed) | 2.5 | ✓ |
| FR-15 | Grade → familiarity | 2.5 | ✓ |
| FR-16 | Attach note mid-drill | 3.4 | ✓ |
| FR-17 | Session summary | 2.7 | ✓ |
| FR-18 | Calm session bounds | 2.3 / 2.7 | ✓ |
| FR-19 | Automatic scheduling | 2.1 / 2.3 | ✓ |
| FR-20 | Familiarity model | 2.1 | ✓ |
| FR-21 | Familiarity display | 2.6 | ✓ |
| FR-22 | Create note(s) | 3.1 | ✓ |
| FR-23 | Note visibility (set+flip) | 3.2 | ✓ |
| FR-24 | Partner sees shared notes | 3.1 / 3.3 | ✓ |

### Missing Requirements
None. No uncovered FRs. No stories claim FRs absent from the PRD (no scope creep).

### Coverage Statistics
- Total PRD FRs: **24**
- FRs covered in epics/stories: **24**
- Coverage: **100%**

## UX Alignment Assessment

### UX Document Status
**Found** — `DESIGN.md` (visual identity) + `EXPERIENCE.md` (IA, behavior, states, flows), both final, with `mockups/`.

### UX ↔ PRD Alignment ✓
- EXPERIENCE.md's IA (8 surfaces) maps to PRD features F1–F5; each IA row cites its FRs.
- Journeys **UJ-1/2/3 mirror the PRD verbatim** (Jake drills, Dani adds, Dani finds Jake's note).
- UX Voice & Tone encodes the PRD's calm guardrail ("calm is the manner, not the mission"); no UX requirement contradicts or exceeds PRD scope.

### UX ↔ Architecture Alignment ✓
- EXPERIENCE.md components ↔ architecture's `apps/hotaru/` module (Flashcard, FamiliarityIcon, FireflyLayer, GradeButtons, AvatarSwitcher, NoteList…) — 1:1.
- **Calm contract is mutually enforced:** UX "queue not debt" ↔ architecture's debt-free response schemas.
- **Familiarity:** DESIGN.md 5-tier colour/icon ramp ↔ architecture's 5-tier SRS model; tier→colour mapping correctly owned by the frontend (DESIGN.md), tier integer by the backend.
- **Drill feel:** UX batch-fetch + optimistic local grading ↔ architecture's batch `POST /practice/grades` + background sync.
- **Accessibility:** UX "colour never the sole signal" + reduced-motion ↔ supported by the FamiliarityIcon (icon+label+colour) and FireflyLayer fallback.

### Warnings / Open Items (non-blocking)
- **Familiarity icon glyphs TBD** — flagged identically in DESIGN.md and the architecture; size/placement locked, final glyphs deferred. Does not block stories.
- **Japanese display font TBD** — system CJK fallback in mocks; pick a Japanese-capable font before/at build. Minor.

No misalignments. Architecture accounts for both PRD and UX needs.

## Epic Quality Review

### Epic structure — user value & independence
- **Epic 1 (Foundation & Vocabulary Library):** user value ✓ (open, pick user, browse/organize seeded vocab). Despite the word "Foundation," the goal is user-facing, not a technical milestone.
- **Epic 2 (Drilling & SRS):** user value ✓ (practise and see progress).
- **Epic 3 (Cooperative Notes):** user value ✓ (leave/discover memory hacks).
- **Independence ✓:** Epic 1 standalone; Epic 2 uses only Epic 1; Epic 3 uses Epics 1–2. No epic requires a *future* epic (FR-16 deliberately placed in Epic 3 so the Epic-2 drill never depends on notes).
- **File-churn ✓:** Epic 1 = vocab/library files, Epic 2 = practice/SRS files, Epic 3 = notes files — distinct components.

### Story quality
- **Sizing ✓** — each story is single-dev-sized and cohesive.
- **Forward dependencies: none ✓** — within each epic stories are strictly ordered (e.g. 2.1 engine → 2.2 overview → 2.3 drill → 2.5 grade; 3.1 notes → 3.3 in-drill → 3.4 attach).
- **Entity/file creation timing ✓** — files/repos created by the first story that needs them (vocab 1.4, user-words 1.5/1.6, topics 1.7, progress 2.1, notes 3.1); no upfront mass creation.
- **ACs ✓** — Given/When/Then, testable, FR-referenced; key error/edge paths present (1.1 collision, 1.5 missing field, 1.6 privacy-absent, 2.5 typed non-match, 3.2 non-author edit).
- **Brownfield setup ✓** — no starter template (existing platform); Epic 1's first stories (1.1 seed prep + 1.2 shell registration) are the correct brownfield equivalent of project init, integrating with the existing shell.

### Findings by severity
**🔴 Critical:** none.
**🟠 Major:** none.
**🟡 Minor (accept-with-note):**
1. **Stories 1.1 (offline seed tool) and 2.1 (pure SRS engine)** are *enabler* stories without direct end-user-facing value. Justified — 1.1 is the architecture's named "first story" (analogous to project init), 2.1 is a cohesive, table-tested pure algorithm that the rest of Epic 2 builds on; both are framed around their FRs and introduce no forward dependency. No action required; noted for transparency.
2. **Error/edge ACs are present but lean** on a few stories (e.g. 1.7 topics, 2.4 direction). The dev-story step can enrich edge cases per story. Non-blocking.

### Best-practices compliance checklist
- [x] Each epic delivers user value
- [x] Each epic functions independently
- [x] Stories appropriately sized
- [x] No forward dependencies
- [x] Entities/files created when needed
- [x] Clear, testable acceptance criteria
- [x] Traceability to FRs maintained (100%)

## Summary and Recommendations

### Overall Readiness Status
**READY FOR IMPLEMENTATION.**

The four Hotaru artifacts (PRD, Architecture, UX, Epics/Stories) are complete, mutually consistent, and traceable. FR coverage is 100% (24/24); UX aligns with both PRD and Architecture; epics/stories pass the quality bar with no critical or major violations. The plan rides the existing platform conventions, keeping scope tight.

### Critical Issues Requiring Immediate Action
None. No critical or major issues found.

### Minor / Pre-build Items (non-blocking)
1. **Familiarity icon glyphs** — finalize during Epic 2 (size/placement already locked; default placeholder fine to start).
2. **Japanese display font** — choose a CJK-capable font before/at build (system fallback works for now).
3. **Enabler stories** 1.1 (offline seed tool) and 2.1 (pure SRS engine) are intentionally non-user-facing — accepted; no change needed.
4. Enrich error/edge ACs per story at the `create-story` step.

### Recommended Next Steps
1. **Proceed to build.** Start with **Story 1.1** (offline Genki seed-dataset prep) — it unblocks meaningful testing of everything downstream — then **Story 1.2** (register the app).
2. Run **`/bmad-sprint-planning`** to generate sprint tracking from `epics-hotaru.md`, then **`/bmad-create-story`** → **`/bmad-dev-story`** per story.
3. Address the minor items above opportunistically (font + icons during Epic 2).

### Final Note
This assessment identified **0 critical/major issues** and **4 minor, non-blocking items** across document discovery, PRD coverage, UX alignment, and epic quality. The Hotaru plan is ready to implement as-is.

**Assessor:** Implementation Readiness review (BMad) · **Date:** 2026-06-15
