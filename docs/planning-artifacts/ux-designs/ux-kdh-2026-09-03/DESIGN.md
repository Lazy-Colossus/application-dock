---
title: "KDH — Visual Identity (DESIGN.md)"
status: draft
created: 2026-09-03
updated: 2026-09-03
identity: "Eggplant Wash"
sources:
  - ../../../superpowers/specs/2026-09-02-kdh-design.md
  - ../../epics-kdh.md
  - .decision-log.md
  - mockups/directions.html
inherits_ui_system: "Vue 3 + Quasar v2 (Material-based)"
name: KDH
description: "A shared availability calendar for a small, fixed group. A violet-black field on which a month of days washes from deep eggplant to pastel lilac as more people say they are free — the days that work are simply the brightest thing on the screen. Restraint is the point: colour carries one idea, everything else is quiet."
colors:
  # --- Field (violet-black; the app's ground) ---
  field: '#15111C'          # page
  field-raise: '#1F1829'    # popovers, sheets, the name dropdown
  field-line: '#332942'     # hairline borders on raised surfaces
  # --- Ink ---
  ink-hi: '#EBE4F4'         # primary text
  ink-mid: '#A79BBC'        # secondary text, month label
  ink-lo: '#7B6F91'         # tertiary, weekday initials, meta
  ink-on-light: '#1A1024'   # ink placed on wash steps 5-6
  # --- The coverage wash. ORDERED: answers "how many can come". ---
  wash-0: '#221B2E'         # nobody
  wash-1: '#31234A'         # lightened from the mock so one vote reads as a change
  wash-2: '#3A2A56'
  wash-3: '#4E3770'
  wash-4: '#6C4C93'
  wash-5: '#9773BC'
  wash-6: '#C9AEE6'         # full coverage
  # --- Semantic (separate from the wash) ---
  danger: '#CF6679'
  # The decided day — a third colour dimension (see Components → Chosen day).
  gold: '#FFD54A'
  gold-deep: '#5F4200'   # legible against the pale top of the ramp
  # NB: there is still no *accent* hue — gold carries a meaning, not a role.
typography:
  font-stack:
    ui: 'inherits the platform Roboto/system stack from Quasar'
    numeric: 'ui-monospace, "SF Mono", "Spline Sans Mono", Menlo, Consolas, monospace'
    note: 'No webfont is loaded. Spline Sans Mono was the specimen face in the mock; the app uses a system mono stack so KDH adds no font payload to the dock.'
  month-label:
    fontSize: 13px
    letterSpacing: 0.1em
    textTransform: uppercase
    note: 'ink-mid'
  day-number:
    fontSize: 14px
    fontWeight: '500'
    fontFamily: numeric
    note: 'tabular-nums; every cell. 700 and gold on the chosen day.'
  day-count:
    fontSize: 11.5px
    fontFamily: numeric
    note: 'tabular-nums; the backstop when two wash steps look alike'
  weekday-initial:
    fontSize: 9.5px
    letterSpacing: 0.06em
    note: 'ink-lo'
  sheet-title:
    fontSize: 16px
  name-row:
    fontSize: 14px
  label-caps:
    fontSize: 10.5px
    letterSpacing: 0.14em
    textTransform: uppercase
rounded:
  cell: 7px
  panel: 12px      # dropdown, day sheet
  chip: 999px
  swatch: 999px
spacing:
  screen-pad-x: 15px
  cell-gap: 4px
  panel-pad: 12px
  row-pad-y: 11px   # name rows; keeps the 44px touch target
  touch-min: 44px
components:
  day-cell:
    size: 'aspect-ratio 1 / 1.06, seven per row'
    contains: 'date + coverage count only — never names'
  name-dropdown:
    placement: 'month header, left'
    contains: 'roster rows'
  day-sheet:
    placement: 'over the month, dismissible'
    contains: 'full roster for that date + the three-state control'
---

# KDH — Visual Identity

> The how-it-looks contract. `EXPERIENCE.md` is the peer document and owns how it
> works; it references these tokens by name. **Both spines win over any mock.**

## Brand & Style

KDH is a wall calendar for six people who cannot find an evening. Its whole job is
to make the answer obvious before you have read anything, so exactly one idea is
allowed to carry colour: **how many people can come**. Everything else — chrome,
labels, navigation — stays quiet enough that the month is the only thing with
presence.

The world is a **violet-black field** washed with **eggplant through pastel
lilac**. It is deliberately not the dock's Carbon theme: KDH is its own thing, the
way Hotaru is. It is also deliberately not expressive the way Hotaru is — no
atmosphere, no motion layer, no ornament. The restraint is the identity.

Tone: unhurried. This is an app you open, glance at, tap once, and close.

## Colors

**One ordered ramp, one categorical set, and they must never be confused.**

`wash-0` … `wash-6` are **ordered**: they answer *how many can come*, and their
order is the meaning. They are the only purples in the interface.

**There is only one colour system.** Invitees have no colours. They had them, and
every appearance turned out to be a dot beside the name it identified — decoration,
not information. The rule that replaced them: a colour must earn its place by
saying something no other element on screen is already saying.

The ramp is **relative to the number of active invitees**, not absolute. Five of
six is `wash-5`; five of ten is not. Removed invitees leave the denominator but
keep their colour reserved while they still hold past votes.

`ink-on-light` replaces `ink-hi` at `wash-5` and `wash-6`, where the field has
become light enough that pale text fails. This is a hard switch, not a fade.

## Typography

The interface is mostly digits, so the one typographic decision that matters is
that they line up: every date and count uses the **numeric stack** with
`font-variant-numeric: tabular-nums`. Everything else inherits the platform's
Roboto/system stack from Quasar — KDH adds no font payload to the dock.

## Layout & Spacing

**Weekends** are a faint band painted **behind** the last two columns, so it shows
only in the gutters and the grid's padding and never touches a cell. Not a
stylistic preference: the wash is the only thing allowed to tint a cell, so a
weekend fill *on* a cell would read as votes.

Seven columns, **Monday first**, `cell-gap` between cells, `screen-pad-x` at the
edges. The tracks are `minmax(0, 1fr)`, **not** `1fr` — a `1fr` track has an *auto*
minimum, so one cell with a long line of names silently widens its whole column and
the seven stop being equal. Cells carry `min-width: 0` and `overflow: hidden` for
the same reason: content must fit the track, never the other way round. Cells are `aspect-ratio: 1 / 1.06` — very slightly taller than square, so
the date and the count stack without crowding. On a 360px phone this yields
roughly 44px cells, which is also the touch minimum; the cell *is* the target.

Nothing else competes for vertical space above the month. The month header is one
line: the name dropdown on the left, month label and arrows on the right.

## Elevation & Depth

Two levels only. The field is flat. Raised surfaces — the name dropdown, the day
sheet — sit on `field-raise` with a `field-line` hairline and no shadow. Shadow is
not used anywhere: on a near-black ground it reads as mud.

## Shapes

`rounded.cell` on day cells, `rounded.panel` on raised surfaces, `rounded.chip`
on anything carrying a person's name.

**Both marks keep a shape**, because they must survive every step of the ramp and
the past-day dimming — and, for the chosen day, because the colour must not be the
only signal:

- **Chosen day** — a **`gold` frame in the gutter** around the cell: 2px of a 4px
  phone gap, 2.5px of a 6px web one. It never touches the wash, so it looks the same
  at `wash-0` and at `wash-6` — which nothing painted on the cell could manage.
  Because the frame carries the message, the date does **not** have to: it is bold
  `gold`, dropping to `gold-deep` on `wash-5`–`wash-6`, with no glow and no outline
  propping it up. A small **crown** sits directly above the date in the same golds,
  and **its slot is reserved in every cell**, crowned or not — that is what keeps
  the dates on one line across the month. The chosen cell is lifted a layer, or
  later grid siblings paint over its frame; and when a day is both chosen and
  provisional the two compose — the provisional hairline inset, the frame outside.
- **Provisional coverage** — a 1px inset hairline in `wash-6` around a cell that
  only reaches full coverage because someone answered *if needed*.

## Components

**Chosen day.** Gold is a **third colour dimension**, added at the user's
direction: the wash says *how many can come*, an invitee colour says *who*, and
gold says *this is the one*. It is the dock's family of gold used for a meaning the
dock does not have — so the "never use the dock's gold" rule below is narrowed to
mean *never as an interactive accent*, which is what it was protecting against.
The crown stays, so the marking never depends on colour alone.

**Day cell.** Square on the web layout, and slightly taller than square on a phone
to carry the row of dots — the alternative was shrinking the date and the count,
which exist at their sizes deliberately. A reserved crown slot, the date, then the
coverage count beneath it, on a `wash-*` background; on the web layout the voter
names sit **directly under the count**, not at the foot of the cell — a square this
full has no bottom margin to spare, and anchoring them to it is what made them spill
out. Two lines, **line-clamped so the browser marks the cut with an ellipsis**: a
day whose names do not fit should say so rather than end mid-word. The full list is
always a hover or a tap away. Nothing else fits and nothing else is allowed. The count
sits in a padded target of its own — the digits alone are about 7px wide, which is
not something to point at — which highlights on hover and anchors the list of who
voted. The three pieces total ~42px in a ~46px cell, so there is no room for a
fourth. Today carries a 1px `ink-mid`
outline; past days drop to 30% opacity.

**Name dropdown.** In the month header. Closed, it shows the claimed person's dot
and name; unclaimed, it reads "Who are you?". Open, it lists every active invitee
as a row with a tick on the claimed one. Rows are `touch-min` tall.

**Buttons.** KDH has **no accent colour**. A primary action is a raised surface —
`wash-3` fill with `ink-hi` — not a bright fill, because the wash is the only thing
allowed to compete for attention and a coloured button would be a second. A
destructive action is `danger` text on a transparent ground. The dock's gold is
never used.

**Raised surfaces.** Dialogs and sheets take `field-raise` with a `field-line`
hairline and **no shadow** — a shadow on a near-black ground reads as mud. The
tokens are declared on both `.kdh-app` and `.kdh-panel`, because Quasar teleports
dialogs to the body, outside the page; without the second root a dialog silently
falls back to the shell's theme mid-flow.

**Day sheet.** Opens on tapping a cell. The date, the full roster for that date
with each person's colour, and the three-state control. *If needed* rows are
italic and slightly recessed — set apart by weight and style, never by tinting the
person's colour, which has to keep meaning *that person*.

## Do's and Don'ts

- **Do** let the wash be the loudest thing on screen. **Don't** add a second
  saturated colour anywhere.
- **Do** keep the count in the cell, and sized to be read. **Don't** treat it as
  decoration — `wash-4` and `wash-5` are genuinely close, and the number is what
  settles them.
- **Do** mark a day in a channel the wash does not use — the gutter, the frame,
  elevation. **Don't** paint the marking onto the cell: its background is the
  ordered wash and its text is categorical, and a third meaning laid on top is what
  made every earlier attempt look loud. Marks should differ **in kind** — a frame,
  a filled shape, a line — never be three variations on colour.
- **Do** mark chosen and provisional days with shape. **Don't** encode either in
  colour; both must survive the ramp and the dimming.
- **Don't** put names in a day cell. They do not fit at 44px, and the attempt is
  what makes phone calendars unreadable.
- **Don't** use gold as an *interactive* accent. It means "clickable" across the
  rest of the platform, and in KDH it means "this is the decided day" — one meaning
  each, and neither is "press me".
