---
title: "KitchenCraft — Visual Identity (DESIGN.md)"
status: final
created: 2026-09-10
updated: 2026-09-10
identity: "Beige Ledger"
sources:
  - ../../prds/prd-kitchencraft-2026-09-09/prd.md
  - ../../epics-kitchencraft.md
  - .decision-log.md
inherits_ui_system: "Vue 3 + Quasar v2 (Material-based)"
name: KitchenCraft
description: "A private recipe collection that reads like a household notebook. Beige paper, black ink, one moss green that means 'press me' and one pumpkin taupe that means 'quiet'. Set in a serif. No pictures of anything, ever."
colors:
  # --- Ground (beige paper; two steps only) ---
  beige: '#EAE1CD'        # the page
  beige-raise: '#F5F0E2'  # modals, panels, chip fills — lifted paper
  # --- Ink (black; text, marks, rules that must be read) ---
  ink: '#141310'
  # --- Moss green: interactive and active state ONLY ---
  moss: '#4F6B3A'
  on-moss: '#F5F0E2'      # the only text colour that passes on a moss fill
  # --- Pumpkin taupe: the quiet register ---
  taupe: '#96775F'        # hairlines, borders, marks — NON-TEXT ONLY
  taupe-ink: '#6E5541'    # the same family, darkened, for quiet TEXT
  # --- The one colour outside the family ---
  danger: '#8E2B1F'       # destructive confirmations only
typography:
  font-stack:
    serif: 'ui-serif, Georgia, "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif'
    note: 'One family, no webfont. This overrides the Quasar/Roboto sans default at the app layer; per-app type overrides are established dock precedent (KDH declares a system mono stack the same way). KitchenCraft adds no font payload to the dock.'
  title:
    fontSize: 22px
    fontWeight: '600'
    lineHeight: '1.25'
    note: 'Screen titles, recipe name in the reading view, modal titles.'
  recipe:
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.75'
    note: 'The recipe body. The hero. Never smaller than this on any surface or breakpoint.'
  body:
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
    note: 'All other reading text, field values, list rows, buttons.'
  meta:
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.45'
    note: 'Meal type, time, counts, source, provenance. Set in taupe-ink.'
  label-caps:
    fontSize: 11px
    fontWeight: '600'
    letterSpacing: '0.12em'
    textTransform: uppercase
    note: 'Section labels only — Ingredients, Tags, Shopping list. Set in taupe-ink.'
rounded:
  sm: 3px   # fields, buttons, chips, rows
  md: 6px   # modals and panels
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 24px
  '6': 32px
  screen-pad-x: 16px
  measure: 62ch
  touch-min: 44px
components:
  field:
    background: '{colors.beige-raise}'
    border: '1px {colors.taupe}'
    radius: '{rounded.sm}'
    text: '{colors.ink}'
    min-height: '{spacing.touch-min}'
    focus: '2px {colors.moss} ring, offset 1px'
  button-primary:
    background: '{colors.moss}'
    text: '{colors.on-moss}'
    radius: '{rounded.sm}'
    height: 52px
  button-quiet:
    background: 'transparent'
    border: '1px {colors.taupe}'
    text: '{colors.ink}'
    radius: '{rounded.sm}'
    height: 52px
  button-danger:
    background: 'transparent'
    text: '{colors.danger}'
    radius: '{rounded.sm}'
    height: 52px
  chip:
    background: '{colors.beige-raise}'
    border: '1px {colors.taupe}'
    text: '{colors.ink}'
    radius: '{rounded.sm}'
    min-height: '{spacing.touch-min}'
    selected: 'background {colors.moss}, text {colors.on-moss}, border {colors.moss}'
  chip-unconfirmed:
    background: 'transparent'
    border: '1px {colors.taupe}'
    text: '{colors.taupe-ink}'
    radius: '{rounded.sm}'
    note: 'Enrichment-written value, not yet touched by the user. Unfilled where a confirmed chip is filled.'
  recipe-row:
    background: 'transparent'
    separator: '1px {colors.taupe} below'
    min-height: 64px
    text: '{typography.body} {colors.ink}'
    meta: '{typography.meta} {colors.taupe-ink}'
  list-row:
    background: 'transparent'
    separator: '1px {colors.taupe} below'
    min-height: '{spacing.touch-min}'
    ticked: 'line-through {colors.ink}, stays in place'
  typeahead:
    background: '{colors.beige-raise}'
    border: '1px {colors.taupe}'
    radius: '{rounded.sm}'
    row-min-height: '{spacing.touch-min}'
    row-text: '{colors.ink}'
    note: 'Anchored under its field, full field width. No fill on the highlighted row beyond a moss focus ring.'
  new-category-row:
    background: 'transparent'
    separator: '1px {colors.taupe} above'
    text: '{colors.taupe-ink}'
    icon: 'functional add icon, leading, {colors.taupe-ink}'
    min-height: '{spacing.touch-min}'
    note: 'Last row of the Ingredients typeahead only. Distinct by position, rule, icon and wording — never by colour alone.'
  modal:
    background: '{colors.beige-raise}'
    border: '1px {colors.taupe}'
    radius: '{rounded.md}'
    backdrop: '{colors.ink} at 45%'
  rule:
    color: '{colors.taupe}'
    width: 1px
---

# KitchenCraft — Visual Identity

> The how-it-looks contract. `EXPERIENCE.md` is the peer document and owns how it
> works; it references these tokens by name. **Both spines win over any mock or
> import.** One mock exists — [`mockups/key-collection.html`](mockups/key-collection.html),
> the collection screen at both breakpoints. It illustrates; it does not decide.
> No wireframes and no imports exist for this workspace.

## Brand & Style

KitchenCraft is a household recipe notebook. Someone pastes a block of text out of
a browser tab at 18:40 and cooks from it at 18:55, phone propped against the
kettle. The whole visual argument is that **the text is the hero** (PRD §11): beige
paper, black ink, generous leading, a comfortable measure, and nothing at all
competing with the method while a pan is going.

The register is **folk** — beige paper, black ink, moss green, pumpkin taupe, set
in a serif. That register is carried **entirely by the palette and the type**.
There is **no imagery of any kind**: no illustration, no texture, no grain, no
ornament, no decorative icons, nothing drawn. This is not a preference to be
softened later; two earlier illustrative directions were struck outright
(`.decision-log.md` Entries 10, 13, and the diagnosis in Entry 14), and the third
brief exists because the mood kept being smuggled back in as decoration. Beige,
black, moss, taupe and a serif are the whole vocabulary.

KitchenCraft is the **first light-ground app** on a dock of dark-field apps
(Carbon `#141414`, Hotaru, KDH `#15111C`). It is deliberately not Carbon, in the
way KDH and Hotaru are deliberately not Carbon — but it keeps the chassis: Vue 3 +
Quasar v2, the 4-point spacing grid, the 44px touch minimum, and the house
**no-shadow** rule. Where this file is silent, Carbon wins; where it speaks, it
overrides.

## Colors

Four tones, eight tokens, and **each tone has exactly one job**. `[ASSUMPTION]`
Both the exact hex values and this allocation are drafted for the user to strike;
the tone families (beige / black / moss green / pumpkin taupe) are the user's.

- **Beige `#EAE1CD`** — the page. Warm and saturated enough to read as paper
  rather than as an off-white UI background.
- **Beige-raise `#F5F0E2`** — lifted paper: modals, panels, field interiors, chip
  fills. It is only a **1.14:1** step above the page, so the step alone never
  carries a boundary — a `{colors.taupe}` hairline always does (see Elevation).
- **Ink `#141310`** — black. All primary text, the favourites mark, the
  ticked-item strike-through, and every rule that must be read as structure.
  **14.29:1 on beige, 16.32:1 on beige-raise** — AAA at every size.
- **Moss `#4F6B3A`** — **interactive and active state only**: primary buttons,
  selected filter chips, focus rings, the active favourites-only toggle. This
  preserves the platform rule KDH states plainly — the accent means "clickable"
  across the dock, so nothing that is not pressable may wear it. `[ASSUMPTION]`
  - **4.62:1 against beige** — passes AA as text and icon colour on the page, and
    clears the 3:1 non-text floor as a focus ring or hairline.
  - **On a moss fill the text is `{colors.on-moss}` (`#F5F0E2`) at 5.28:1.**
    `{colors.ink}` on moss is **3.09:1 and fails AA** — so ink must never be set on
    a moss fill. This is the Entry 13 lesson read in the other direction: that
    lesson bites tones light enough to read as light, and this moss is dark
    enough that the pale text is the one that passes. It was measured, not
    assumed.
- **Pumpkin taupe `#96775F`** — the quiet register, and **non-text only**: every
  hairline and border, the unconfirmed-provenance outline, the structure sitting
  at the edges. **3.17:1 against beige** — enough for a border or a mark under
  WCAG 1.4.11, **not enough for text at any size**.
- **Taupe-ink `#6E5541`** — the same family, darkened, so the quiet register can
  still speak. **5.31:1 on beige, 6.07:1 on beige-raise** — AA. Carries `meta` and
  `label-caps`: meal type, time, servings, source, result counts, section labels,
  unconfirmed chip text.
- **Danger `#8E2B1F`** — the only colour outside the family. Destructive
  confirmations only (delete a recipe, overwrite or clear the list). **6.42:1
  against beige.** Never fills a background; it is the label on
  `{components.button-danger}`.

**Restricted on contrast grounds, not preference.** The brief allocated meta text
to pumpkin taupe. At its natural lightness the tone measures 3.17:1 and cannot
carry small text, so meta and label text moved to `{colors.taupe-ink}` — the same
family, darkened — and `{colors.taupe}` kept the hairlines and marks. The hue
family was not adjusted to rescue the use; the use was moved.

Avoid: gradients, tints, alpha washes, any second green, any fill in a colour that
is not moss (interactive) or beige-raise (paper). No colour exists in this system
for a non-interactive "highlight".

## Typography

**One serif family, no webfont.** The stack is
`ui-serif, Georgia, "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif`
— system faces only, so KitchenCraft adds no network payload. This **overrides
Quasar's Roboto sans at the app layer**, which is established dock precedent: KDH
declares its own system mono stack for the same reason. `[ASSUMPTION]`

Five roles, and no more:

| Role | Size / leading | Used for |
|---|---|---|
| `title` | 22px / 1.25, 600 | Screen titles, recipe name, modal titles |
| `recipe` | 18px / 1.75 | **The recipe body.** The hero |
| `body` | 16px / 1.6 | Everything else read at normal distance |
| `meta` | 13px / 1.45 | Meal type, time, servings, source, counts — in `{colors.taupe-ink}` |
| `label-caps` | 11px / 0.12em, uppercase | Section labels only — in `{colors.taupe-ink}` |

`recipe` at 18px/1.75 inside `{spacing.measure}` (62ch) is the whole answer to the
PRD's mid-cook success metric — readable at arm's length on a phone, one-handed,
**without pinch-zoom**. It is a floor, not a target: no surface and no breakpoint
renders the body below it, and nothing is ever compressed to fit more on screen.

Honour the system font scale at every role. `{spacing.touch-min}` must hold at the
largest system setting; nothing truncates and no control collapses.

Counts and times set `font-variant-numeric: tabular-nums`. The serif stack renders
oldstyle figures on some platforms; that is accepted — a notebook is allowed
text figures, and no numeric column in KitchenCraft is wide enough for the
variation to matter. `[ASSUMPTION]`

## Layout & Spacing

Carbon's **4-point grid**, inherited unchanged: 4 / 8 / 12 / 16 / 24 / 32px.
`{spacing.screen-pad-x}` is 16px at every breakpoint. `[ASSUMPTION]`

- **Measure is a hard constraint.** Reading text never exceeds
  `{spacing.measure}` (62ch), on any surface, at any width. On a wide viewport the
  column centres and the window gets wider; the line does not.
- **Structure sits at the edges** (PRD §11). Meal type, time, servings, source,
  tags and ingredients are set in `meta` and `label-caps`, above and below the body
  and never wrapped around it. Nothing frames the method.
- Single column on phone. Two breakpoints only — see
  `EXPERIENCE.md § Responsive & Platform`, which owns the layout behaviour; this
  file owns only that the measure and the `recipe` floor survive both.
- Minimum tap target `{spacing.touch-min}` (44px); primary buttons 52px.

## Elevation & Depth

**No box shadows anywhere.** House rule, inherited from Carbon and restated by
KDH. Depth is a surface step plus a hairline, and nothing else.

The step here is deliberately faint — `{colors.beige}` → `{colors.beige-raise}` is
1.14:1 — because two sheets of the same paper do not differ much. So on a light
ground **the hairline is the boundary, not the step**: every raised surface takes a
1px `{colors.taupe}` border. A modal additionally dims the page behind it to 45%
`{colors.ink}`.

Two levels only. Modals never stack; a confirmation replaces the modal beneath it
rather than sitting on top of it, with the one stated exception in
`EXPERIENCE.md § State Patterns` (the overwrite second confirmation).

## Shapes

`{rounded.sm}` (3px) on fields, buttons, chips and rows. `{rounded.md}` (6px) on
modals and panels. That is the entire shape language — near-square, because paper
and ruled lines are near-square, and because anything softer starts to read as a
consumer app rather than a notebook.

**No pills.** No fully-rounded anything: not chips, not toggles, not buttons.
Carbon's "no pill-shaped action buttons" rule holds and is extended to chips.

## Components

> Visual reference: [`mockups/key-collection.html`](mockups/key-collection.html)
> shows `recipe-row`, `chip` (selected and unselected), `field` (at rest and focused),
> `button-primary`, `button-quiet` and `rule` in composition. **This file wins on
> conflict with that mock.**

- **Field** (`{components.field}`) — `{colors.beige-raise}` interior, 1px
  `{colors.taupe}` border, `{rounded.sm}`, `{colors.ink}` value, 44px minimum.
  Focus is a 2px `{colors.moss}` ring at 1px offset — visible at 4.62:1 against
  the page. The capture body is the same field grown to fill the screen. Labels
  sit above in `label-caps`; **placeholders are not used as labels**.
- **Primary button** (`{components.button-primary}`) — 52px, `{colors.moss}` fill,
  `{colors.on-moss}` label in `body`, `{rounded.sm}`. Full width on phone. One per
  surface: it is the thing you came to do.
- **Quiet button** (`{components.button-quiet}`) — 52px, transparent, 1px
  `{colors.taupe}` border, `{colors.ink}` label. Cancel, Close, Clear filters.
- **Danger button** (`{components.button-danger}`) — `{colors.danger}` label on
  transparent. Delete, Overwrite, Clear list. Never a fill.
- **Chip** (`{components.chip}`) — one shape for tags, ingredients, meal types and
  filters. Unselected: `{colors.beige-raise}` fill, `{colors.taupe}` border,
  `{colors.ink}` text. **Selected: `{colors.moss}` fill, `{colors.on-moss}` text**
  — only ever on a chip that is a control. A chip that is merely displaying a value
  in the recipe view is never moss, because it is not pressable.
- **Unconfirmed chip** (`{components.chip-unconfirmed}`) — a value written by the
  offline enrichment script and not yet touched. **Unfilled** where a confirmed
  chip is filled, 1px `{colors.taupe}` outline, text in `{colors.taupe-ink}`. Two
  signals, neither of them colour alone: the missing fill and the lighter ink. It
  never shouts, carries no icon and no badge, and the whole tell drops the moment
  the user touches the value (`EXPERIENCE.md § State Patterns`).
- **Recipe row** (`{components.recipe-row}`) — the collection list unit. Name in
  `body`/`{colors.ink}`; meal type and time, **when present**, in `meta`/
  `{colors.taupe-ink}` on a second line. 1px `{colors.taupe}` rule below, no fill,
  no card, no chevron. The favourites mark is an **ink glyph** at the trailing
  edge — a filled star when favourited, an outlined one when not — never moss, and
  never a colour change alone. 64px minimum.
- **Shopping-list row** (`{components.list-row}`) — the whole row is the target, at
  least 44px, 1px `{colors.taupe}` rule below. Ticked: `{colors.ink}`
  line-through plus a filled ink checkbox, **in place** — not removed, not
  reordered, not dimmed to unreadability.
- **Typeahead** (`{components.typeahead}`) — a panel anchored under its field, at
  the field's full width, `{colors.beige-raise}` with a 1px `{colors.taupe}`
  border and `{rounded.sm}`. Rows are 44px, `{colors.ink}`, separated by nothing.
  The keyboard-highlighted row takes the same 2px `{colors.moss}` ring as a field,
  not a fill — a filled row would read as *selected* when it is only *highlighted*.
- **New-category row** (`{components.new-category-row}`) — the last row of the
  `Ingredients` typeahead, and only there. Sits under a 1px `{colors.taupe}` rule
  that no other row has, carries a leading functional `add` icon that no other row
  has, and quotes the typed value back in `{colors.taupe-ink}`. Distinct by
  position, rule, icon and wording — **never by colour alone**, so the distinction
  survives at any contrast setting.
- **Modal** (`{components.modal}`) — `{colors.beige-raise}`, 1px
  `{colors.taupe}`, `{rounded.md}`, backdrop 45% `{colors.ink}`. Title in `title`,
  one primary and one quiet action at the foot.
- **Rule** (`{components.rule}`) — 1px `{colors.taupe}`. The only separator in the
  system. Used between rows and between the body and the structure at the edges;
  never boxed into a card outline.

Functional Quasar Material icons are permitted where a touch target needs one —
the shopping-list button, search, back — on the same footing as the rest of the
dock, whose card for this app is `menu_book`. **Decorative icons: none.**
`[ASSUMPTION]`

## Do's and Don'ts

| Do | Don't |
|---|---|
| Let the body text be the largest, calmest thing on screen | Compress the body to fit more on screen |
| Use `{colors.moss}` only where something is pressable or active | Use moss to highlight, group, decorate or celebrate |
| Set text on a moss fill in `{colors.on-moss}` | Set `{colors.ink}` on moss — 3.09:1, it fails |
| Use `{colors.taupe}` for hairlines, borders and marks | Set any text in `{colors.taupe}` — use `{colors.taupe-ink}` |
| Carry favourites and the ticked mark in `{colors.ink}` plus a shape | Give either one a colour of its own |
| Express depth with a 1px `{colors.taupe}` hairline | Add a box shadow, an elevation overlay or a card fill |
| Render an absent field as absent | Render a placeholder, a dash, an "unknown", or an empty labelled slot |
| Keep the register in the palette and the serif | Add a texture, a grain, an ornament, an illustration or a decorative icon |
| Keep corners at 3px / 6px | Use pills, circles or Material's default radii |
| Honour the system font scale at 44px minimum | Fix pixel heights that break at large type |
