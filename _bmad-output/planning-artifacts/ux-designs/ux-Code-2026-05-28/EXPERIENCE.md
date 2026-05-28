---
name: Multi-App Platform — Archery Score Counter
status: final
sources:
  - _bmad-output/planning-artifacts/prds/prd-Code-2026-05-26/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/epics.md
updated: 2026-05-28
---

# Multi-App Platform — Experience Spine

## Foundation

Mobile-first web, single-surface. Primary context: phone browser (≥360px), held one-handed outdoors.
Desktop usable — responsive layout adapts but is not the primary design target.

UI system: **Quasar** (Material Design 2, Vue 3). This spine specifies the behavioral delta on top of Quasar defaults.
`DESIGN.md` is the visual identity reference — tokens, colors, typography, component shapes all live there.

Two products in one shell:
- **Multi-App Shell** — landing page, app registry, navigation host
- **Archery Score Counter** — session setup, scoring board, results, history

## Information Architecture

### Shell

| Surface | Reached from | Purpose |
|---------|-------------|---------|
| Shell Home | App open / home button | 2-column app grid; entry point to all apps |

### Archery App

| Surface | Reached from | Purpose |
|---------|-------------|---------|
| Archery Home | Shell Home → Archery card | New Session button; History entry; resume prompt (if in-progress) |
| Session Setup | Archery Home → New Session | Roster entry; confirm roster to proceed |
| Scoring Board | Session Setup → Confirm Roster | 18-target grid; score entry access |
| Score Entry Panel | Scoring Board → tap any target | Bottom sheet; shot entry for all archers on one target |
| Results | Scoring Board → View Results | Ranked totals + per-target breakdown; finalise action |
| History List | Archery Home → History | All finalised sessions, newest first |
| History Detail | History List → tap session | Read-only results view for one past session |

Navigation host: **top app bar** with back arrow (when applicable) and persistent home button (accent icon, right side). No bottom tab bar — single-flow app with linear progression.

→ Mockups: [`shell-home.html`](mockups/shell-home.html) · [`archery-home.html`](mockups/archery-home.html) · [`scoring-board.html`](mockups/scoring-board.html) · [`score-entry-panel.html`](mockups/score-entry-panel.html) · [`results.html`](mockups/results.html). Spines win on conflict.

## Voice and Tone

Terse and direct. This app is used outdoors, one hand, group waiting. No encouragement, no celebration copy, no onboarding text walls.

| Do | Don't |
|----|-------|
| "New Session" | "Start a New Scoring Session!" |
| "Resume" / "Discard" | "Would you like to continue where you left off?" |
| "Confirm" | "Lock in these scores and move on" |
| "History" | "Past Sessions" |
| "Archer name is already used." | "Oops! That name's taken — try another one 😊" |
| Numbers, labels, states only | Explanatory copy on active screens |

Error messages: one sentence, no punctuation beyond a period, no blame.

## Component Patterns

Behavioral. Visual specs (colors, sizes, shapes) live in `DESIGN.md.Components`.

| Component | Use | Behavioral rules |
|-----------|-----|-----------------|
| App card | Shell Home grid | Tap → navigate to app route. No long-press action. |
| Target icon | Scoring Board | Unconfirmed: tap → opens Score Entry Panel. Confirmed (green): tap → re-opens Score Entry Panel, resets to unconfirmed until re-confirmed. |
| Shot button | Score Entry Panel | Tap first button → fills shot 1 slot. Tap second → fills shot 2 slot, auto-advances to next archer. No double-tap required. |
| 11 button | Score Entry Panel | Same behavior as other shot buttons. Visual distinction only (accent fill). No special scoring logic. |
| Bottom sheet | Score Entry Panel, Resume prompt | Slides up. Drag handle visible. Tapping backdrop dismisses only if no partial entry exists. |
| Primary button | Confirm Roster, Confirm Target, Finalise, New Session | Full-width, one per screen section. Accent fill. |
| Secondary button | Discard, Return to Scoring | Full-width, outlined. Below primary when both present. |
| History row | History List | Tap → History Detail. No swipe actions. No delete. |

## State Patterns

| State | Surface | Treatment |
|-------|---------|-----------|
| App loading | Shell Home | Quasar QSpinner, centered, `accent` color. No skeleton screens. |
| No apps registered | Shell Home | Empty grid — not expected in v1; graceful blank only |
| In-progress session exists | Archery Home | Bottom sheet slides up on mount. Two buttons: "Resume" (primary) and "Start Fresh" (secondary). Sheet cannot be dismissed without choosing. |
| No in-progress session | Archery Home | No sheet. Show "New Session" and "History" normally. |
| Roster empty | Session Setup | "Confirm Roster" button disabled. |
| Duplicate archer name | Session Setup | Inline error below input: "Archer name is already used." Input border in `error` color. Button remains disabled. |
| Target unconfirmed | Scoring Board | `surface-card` icon with `border`. |
| Target confirmed | Scoring Board | `confirmed` fill, `confirmed-text` number. |
| All 18 confirmed | Scoring Board | Non-blocking "View Results" banner appears above the grid. Board remains fully interactive. |
| Score entry — partial | Score Entry Panel | Backdrop tap does not dismiss. Back navigation shows "Discard entry?" confirmation. |
| Score entry — complete | Score Entry Panel | "Confirm Target" button activates. |
| Session saving | Scoring Board | Store `loading` ref shows QSpinner on Confirm button. Silent — no toast. |
| Save error | Scoring Board | `store.error` surfaces as a QBanner at top: "Couldn't save. Check connection." Retry available. |
| No history | History List | Empty state: "No sessions yet. Finish a round to see it here." No illustration. |
| History loading | History List | QSpinner centered. |
| History load error | History List | QBanner: "Couldn't load history." |

## Interaction Primitives

- **Tap to act.** No long-press, no swipe-to-action.
- **Back navigation:** top app bar back arrow. Follows Vue Router history. On Scoring Board, back prompts "Leave session? Progress is saved." (since auto-save is Epic 3 — in v1 without auto-save, prompt warns data may be lost).
- **Shot auto-advance:** after second shot is entered for an archer, panel advances to next archer automatically with no tap required. After last archer's second shot, "Confirm Target" activates.
- **Back within score entry:** "Back" button in panel header steps to the previous archer. Preserves entered values.
- **Bottom sheet dismiss:** Score Entry Panel — backdrop tap blocked if any shot entered for current target. Resume/Discard sheet — backdrop tap blocked entirely (forced choice).
- **Banned:** pull-to-refresh, carousels, swipe-to-delete, drag-to-reorder, animations beyond sheet slide-up (Quasar default transition).

## Accessibility Floor

Behavioral. Visual contrast lives in `DESIGN.md`.

- All interactive elements: ARIA label with role and current state. Target icons: `aria-label="Target {n}, {confirmed|not confirmed}"`.
- Shot buttons: `aria-label="Shot value {n}"`. 11 button: `aria-label="Shot value 11, bullseye"`.
- Bottom sheet: `role="dialog"`, `aria-modal="true"`, focus trapped inside while open.
- Focus traversal: follows reading order on every surface. Score Entry Panel focus starts on first shot button for current archer.
- Tap targets: ≥44px height/width on all interactive elements. Shot buttons: 64px (see `DESIGN.md`).
- Dynamic type: Quasar `body` font scale honored. Score Mono (`score` typography) scales with system font size.
- Reduce motion: skip sheet slide-up animation; show sheet immediately.
- No color-only state communication: confirmed target uses green fill + number label (not color alone).

## Key Flows

### Flow 1 — Jamie scores a target (field archery, 3 archers, target 7)

Jamie is holding the phone. The group has just finished target 7. Two archers shot 8 and 10; Jamie got an 11.

1. Jamie opens the scoring board. 6 targets are green; 12 remain.
2. Jamie taps target 7 icon (gray).
3. Score Entry Panel slides up. "Alice" is shown first.
4. Jamie taps **8**, then **5**. Panel advances to "Ben".
5. Jamie taps **10**, then **8**. Panel advances to "Jamie".
6. Jamie taps **11** (gold button). Shot 1 done. Taps **8**. Shot 2 done.
7. "Confirm Target" activates. Jamie taps it.
8. **Climax:** Panel closes. Target 7 turns green. 7 of 18 confirmed.

Edge: Jamie taps **8** for Alice's first shot, then realizes it was a **5**. Taps "Back" — returns to Alice, shot 1 un-fills. Re-enters correctly.

---

### Flow 2 — Session resumed after phone dies (mid-round)

Sam's phone died after target 12. The group borrows a teammate's phone.

1. Teammate opens the Archery app.
2. Resume/Discard bottom sheet slides up: "Resume Session" (primary) / "Start Fresh" (secondary).
3. **Climax:** Teammate taps "Resume". Scoring board restores — 12 targets green, 6 open. Exact state. No data lost.

---

### Flow 3 — Reviewing last week's session (history)

Alex wants to see who won last Tuesday's round.

1. Alex opens Archery Home. Taps "History".
2. History List shows all sessions newest first. Last Tuesday's entry: "2026-05-21 — 3 archers — Winner: Jamie (284)".
3. Alex taps the row.
4. **Climax:** History Detail opens. Full ranked results + per-target breakdown. Read-only. No edit controls visible.

## Responsive & Platform

**Mobile (≥360px, primary):** All layouts single-column except app grid (2-column). Shot button grid fills screen width. Bottom sheets cover 70–85% of screen height.

**Desktop (≥768px):** App grid expands to 3–4 columns. Scoring board targets grid wraps to 6-column layout (3 rows of 6). Score Entry Panel opens as a centered modal dialog (max-width 480px) rather than a bottom sheet. Everything else single-column, max-width 480px centered.

Platform: web browser only. No PWA manifest in v1. No native install prompt.
