---
name: Multi-App Platform — Archery Score Counter
status: final
sources:
  - docs/planning-artifacts/prds/prd-Code-2026-05-26/prd.md
  - docs/planning-artifacts/architecture.md
  - docs/planning-artifacts/epics.md
updated: 2026-05-28
colors:
  surface-base: '#141414'
  surface-raised: '#1E1E1E'
  surface-card: '#242424'
  ink-primary: '#F0F0F0'
  ink-secondary: '#8A8A8A'
  ink-disabled: '#4A4A4A'
  accent: '#C8960A'
  accent-on-accent: '#F0F0F0'
  accent-muted: '#2E2000'
  border: '#2A2A2A'
  confirmed: '#2E7D32'
  confirmed-text: '#A5D6A7'
  error: '#CF6679'
typography:
  display:
    family: Roboto
    weight: 700
    size: 24px
    note: Session labels, screen titles
  body:
    family: Roboto
    weight: 400
    size: 16px
    note: General UI text, labels, descriptions
  label:
    family: Roboto
    weight: 500
    size: 14px
    note: Button labels, chip labels, small headings
  score:
    family: Roboto Mono, monospace
    weight: 700
    size: 20px
    note: All numeric score values — totals, shot values, subtotals
  meta:
    family: Roboto
    weight: 400
    size: 12px
    note: Secondary labels, history entry metadata
rounded:
  sm: 8px
  md: 12px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 24px
  '6': 32px
components:
  shot-button:
    height: 64px
    border-radius: 8px
    note: Common shots (0,5,8) in surface-card; rare shots (10,11) in surface-raised. 11 = accent fill, accent-on-accent text.
  target-icon:
    size: 56px
    border-radius: 8px
    note: Unconfirmed = surface-card + border. Confirmed = confirmed fill + confirmed-text number.
  app-card:
    border-radius: 12px
    note: 2-column grid. surface-card background, accent icon, ink-primary label.
  bottom-sheet:
    border-radius-top: 16px
    note: Slides up over current screen. surface-raised background. Drag handle at top center.
---

## Brand & Style

Carbon is a minimal dark scorekeeping tool — not a sports app, not a game, not a dashboard. It exists for one moment: a small group of people standing in a field, one phone between them, needing to record shots without fumbling. The visual language follows from that moment. Dark surfaces disappear in outdoor light. Yellow-amber accent catches the eye without effort. Nothing decorates; everything functions.

The aesthetic is sleek without being cold — think machined aluminum, not corporate software. Every surface is either doing a job or getting out of the way.

Quasar / Material Design 2 provides the component foundation. This design extends it with Carbon's tokens; do not introduce Material colors, elevation shadows, or ripple effects that conflict with this palette.

## Colors

- **Near-black (`#141414`)** — base surface. The ground everything rests on. Deep enough to disappear outdoors.
- **Dark gray (`#1E1E1E`)** — raised surfaces (headers, bottom sheets, cards that float above base).
- **Card gray (`#242424`)** — card surfaces (target icons, unconfirmed shot buttons, list rows).
- **Off-white (`#F0F0F0`)** — primary text. High contrast against all dark surfaces.
- **Mid gray (`#8A8A8A`)** — secondary text (archer names in history, metadata, supporting labels).
- **Disabled (`#4A4A4A`)** — disabled states only; never for decorative purposes.
- **Goldenrod (`#C8960A`)** — the sole accent. Reserved for: primary action buttons, the 11 (bullseye) shot button fill, active states, focus rings, the home button highlight.
- **Accent-on-accent (`#F0F0F0`)** — text or icons placed directly on accent backgrounds.
- **Accent-muted (`#2E2000`)** — accent backgrounds at reduced prominence (e.g. in-progress session banner).
- **Border (`#2A2A2A`)** — hairline separators; distinguishes surface-card from surface-raised without visual weight.
- **Confirmed green (`#2E7D32`)** — confirmed target fill only. Not used for any other state.
- **Confirmed text (`#A5D6A7`)** — target numbers on confirmed (green) backgrounds.
- **Error (`#CF6679`)** — validation errors (duplicate archer name, empty name input). Never fills a background.

Avoid: gradients, colored fills for non-action states, any color not in this palette.

## Typography

Roboto throughout (Quasar default). Score values use Roboto Mono to read like a scoreboard — fixed-width prevents layout shift as numbers change.

- Headlines / screen titles: `display` (Roboto 700, 24px)
- Body copy, labels: `body` (Roboto 400, 16px)
- Button labels, tabs: `label` (Roboto 500, 14px)
- All numeric scores, shot values, totals: `score` (Roboto Mono 700, 20px)
- History entry metadata, secondary labels: `meta` (Roboto 400, 12px)

Dynamic text sizing: honor system font scale. Minimum touch target (44px) must hold at largest system font setting.

## Layout & Spacing

4-point grid. Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 px.

- Screen horizontal padding: 16px (`spacing.4`)
- Card internal padding: 16px horizontal, 12px vertical
- Between cards in a grid: 12px gap (`spacing.3`)
- Bottom sheet internal padding: 24px horizontal, 20px vertical
- Minimum tap target: 44px height; primary action buttons 64px height
- Shot button grid: 3 buttons wide × 2 rows; each button fills equal width with 8px gap

Single-column layouts throughout. 2-column only for the app grid on the shell landing page.

## Elevation & Depth

No box shadows. Depth is expressed through surface color steps only:

- `surface-base` (#141414) → `surface-raised` (#1E1E1E) → `surface-card` (#242424)

Bottom sheets and dialogs use `surface-raised`. They sit visually above base by color step, not shadow.

## Shapes

- `rounded/sm` (8px): inputs, shot buttons, target icons, list rows, chips
- `rounded/md` (12px): app cards, bottom sheet body panels, result summary cards
- `rounded/full` (9999px): the home button icon only
- No pill-shaped action buttons (full-width rectangular buttons with sm radius only)

## Components

- **Shot button** — 64px tall, full available width (3-wide grid with 8px gaps). Common values (0, 5, 8): `surface-card` background, `ink-primary` label in `score` typography. Rare values (10, 11): `surface-raised` background. 11: `accent` fill, `accent-on-accent` label — always visually distinct.
- **Target icon** — 56px square, `rounded/sm`. Unconfirmed: `surface-card` background, `border` outline, target number in `ink-secondary`. Confirmed: `confirmed` fill, number in `confirmed-text`. Tapping a confirmed icon re-opens score entry and resets to unconfirmed state.
- **App card** (shell) — full height of grid cell, `rounded/md`, `surface-card` background. Icon (Quasar icon, `accent` color) centered above label (`ink-primary`, `label` typography). Equal-width 2-column grid.
- **Bottom sheet** — `surface-raised`, `rounded/full` top-left and top-right corners (16px). Drag handle: 32px × 4px `border` pill, centered. Overlays current screen; background dims to 60% opacity `surface-base`.
- **Primary action button** — full-width, 56px tall, `accent` background, `accent-on-accent` label, `rounded/sm`.
- **Secondary action button** — full-width, 56px tall, `border` outline, `surface-base` background, `ink-primary` label, `rounded/sm`.
- **History list row** — `surface-card` background, `rounded/sm`, 72px min-height. Session label in `body`, winner + score in `meta` (`ink-secondary`). Right chevron in `ink-disabled`.
- **Archer name chip** (roster) — `surface-card`, `rounded/sm`, 44px height, inline in roster list.

## Do's and Don'ts

| Do | Don't |
|----|-------|
| Use `accent` (#E8B400) for one thing at a time — primary action or bullseye, not both on screen simultaneously | Scatter accent across decorative elements or icons |
| Use Roboto Mono for every numeric score value | Mix proportional and monospace fonts within the same score row |
| Express depth with surface color steps | Add box shadows or elevation overlays |
| Keep bottom sheets to one decision at a time | Stack multiple bottom sheets |
| Show confirmed target state in green only | Use green for any other purpose |
| Use full-width buttons with rectangular shape | Use pill-shaped or icon-only primary actions |
| Keep shot buttons at 64px height | Reduce button height to fit more on screen |
