# Tea Cabinet — Visual Identity

> The how-it-looks contract. `EXPERIENCE.md` is the peer document and owns how it works; it
> references these tokens by name. **Both spines win over any mock.**
>
> Mockups: [`mockups/shelf.html`](mockups/shelf.html), [`mockups/tea-detail.html`](mockups/tea-detail.html),
> [`mockups/picker.html`](mockups/picker.html). Design spec:
> [`2026-09-24-tea-cabinet-design.md`](../../../superpowers/specs/2026-09-24-tea-cabinet-design.md).

## Brand & Style

The Cabinet is a record of a tea collection, read in a dim room, on a phone, one-handed, between
infusions. It is **not** the dock's Carbon theme — like Kalendariq and Hotaru, it is its own world.

That world is **clay-black**: a warm, near-black ground with a faint grain, the colour of unglazed
zisha rather than of a screen. Onto it, exactly one idea is allowed to carry colour — **the liquor
the tea makes in the cup**. Jade for green, straw for yellow, silver for white, amber for oolong,
copper for red, mahogany for dark. Those six hues classify, measure and illustrate; nothing else
in the interface is coloured at all.

Tone: unhurried and exact. A ledger kept by someone who cares, not an app that wants attention.

## Colors

**Liquor is the only colour system.** A hue appears in the interface only because a tea makes that
colour in the cup. Buttons, links, errors and chrome are colourless — see *Interactive*, below.

### Ground and ink

| Token | Hex | Used for |
|---|---|---|
| `field` | `#17120E` | The page. Warm clay-black, never neutral `#111`. |
| `raised` | `#1E1712` | Sheets and dialogs — the only raised surfaces. |
| `hairline` | `#241E19` | Field separators on a tea's page. |
| `track` | `#2C241D` | The unfilled part of a rim gauge. |
| `track-out` | `#241E19` | The rim of a tea at 0g — dimmer than `track`. |
| `ink-hi` | `#EFE7DA` | Tea names, page titles, the number in a gauge. |
| `ink` | `#E4D9C6` | Field values. Also every interactive fill. |
| `ink-lo` | `#6B5F52` | Labels, paths, captions, counts. |
| `ink-muted` | `#8B7A63` | Quieter than `ink-hi`, warmer than `ink-lo`: the back link, the hint under a control, an empty state's invitation. |
| `ink-zh` | `#A99781` | Chinese beside a tea's name. |
| `ink-out` | `#574D43` | A tea at 0g — name, path and number together. |
| `ink-on-fill` | `#17120E` | Type on a bone fill. |

### The liquor ramp

`liquor` draws the gauge, the leaves and a selected chip. `head` names the class — a lift of the
same hue, because at 13px the `liquor` value alone is too dark to read. `zh` sets its Chinese name.

| Class | 中文 | `liquor` | `head` | `zh` |
|---|---|---|---|---|
| green | 綠茶 | `#6B8A63` | `#96AF8D` | `#5D6E58` |
| yellow | 黃茶 | `#A8944F` | `#B5A472` | `#6B6144` |
| white | 白茶 | `#B9B2A0` | `#C3BCAA` | `#6E695C` |
| oolong | 烏龍 | `#B8832F` | `#C7A271` | `#7A6244` |
| red | 紅茶 | `#96543A` | `#B8846E` | `#71544A` |
| dark | 黑茶 | `#8C4A3C` | `#BC8578` | `#75504A` |
| other | 其他 | `#6E6255` | `#9A8B78` | `#5C5248` |

These are **categorical, not ordered**. Nothing may imply that dark ranks above green; they are
seven identities, and the fixed display order is the Chinese classification's own, not a ramp.

### Interactive

**Interactive elements carry no hue.** A primary action is a filled bone rectangle — `ink` ground,
`ink-on-fill` type. A secondary action is `ink-hi` text alone. A quiet or destructive one is
`ink-lo` text alone.

This is a hard rule with a specific reason: the app's amber *is* oolong. If the same amber also
meant "button", a colour would carry two meanings, and the class cue — the one thing colour exists
for here — would stop being trustworthy. The dock's gold `#C8960A` is doubly forbidden: it means
"interactive" everywhere else on the platform and it is within a few degrees of the oolong liquor.

Errors are the one place this austerity costs something, and the answer is still no hue: an error
is a `raised` banner with a 2px `ink` rule on its leading edge and plain `ink-hi` text. Errors are
rare, transient and always accompanied by words; a red would either collide with the red class or
introduce an eighth colour with no tea behind it.

### Grain

The field carries a fractal-noise overlay — `feTurbulence`, `baseFrequency .85`, 3 octaves, rect
opacity `.05`, whole layer at `.5`. It makes the ground read as a material rather than as an
absence of light. It is fixed to the field, never to a card, and is `pointer-events: none`.

## Typography

Two serifs and nothing else. No sans anywhere in the app.

- **Newsreader** — every Latin character: names, numbers, labels, notes. A transitional serif with
  enough warmth for tea names and enough discipline for a column of grams.
- **Noto Serif SC** — Chinese only. A Song face, which is the right historical companion to a
  Latin transitional serif; pairing CJK with a geometric sans would look like a settings screen.

Chinese is always secondary to the Latin name it accompanies, never a replacement for it. **A
card's line height is set by the taller of the two faces**, since CJK glyphs need more vertical
room at the same point size.

| Role | Size / weight | Token |
|---|---|---|
| Page title (a tea's name) | 26px / 500, line-height 1.15 | `ink-hi` |
| Title's Chinese | 19px / 300, on its own line | `ink-zh` |
| Shelf header | 19px / 500 | `ink-hi` |
| Tea name on the shelf | 16.5px / 400, line-height 1.28 | `ink-hi` |
| Tea name's Chinese | 13.5px / 300, inline after the name | `ink-zh` |
| Class name | 13px / 500, letter-spacing .04em | `head` |
| Class name's Chinese | 12.5px / 300 | `zh` |
| Field value | 15px / 400 | `ink` |
| Field label, path, caption | 12.5px / 400 | `ink-lo` |
| Gauge number, shelf | 15px / 500 | `ink` |
| Gauge number, tea page | 25px / 500 | `ink-hi` |
| Gauge caption ("of 100g") | 10.5–11px | `ink-lo` |
| Notes body | 14.5px / 400, line-height 1.62 | `#CFC3AF` |

Labels are **sentence case**. No all-caps, no tracked-out eyebrows, no monospace for numbers — the
serif's own lining figures are tabular enough at these sizes and are set with
`font-variant-numeric: tabular-nums` wherever a column of them appears.

## The rim gauge

The app's one instrument. A circle is a cup seen from above; its stroke is drawn round to however
much leaf is left.

- **Geometry.** Shelf: `r 17`, stroke `2.5`, inside a 44px box — which is also the touch minimum,
  so the gauge *is* the target. A tea's page: `r 35`, stroke `4`.
- **Track** in `track`; **fill** in that class's `liquor`, `stroke-linecap: round`, beginning at
  twelve o'clock and running clockwise.
- **Proportion** is `grams_remaining / grams_purchased`.
- **No `grams_purchased`** — the proportion is unknowable, so the ring is drawn as an unbroken
  `track` circle with the number inside it and no caption. It must never imply a full vessel.
- **Below the low threshold**, the fill is dashed (4 on, 4.4 off) rather than solid.
- **The threshold itself** is a 1.2px tick in `ink-lo`, drawn just outside the rim at the angle the
  threshold sits at — so you see not only that a tea is low but how far past the line it went.
- **At 0g**, `track-out` only, nothing drawn on it, number and name in `ink-out`.

The gauge carries class and quantity together, which is why **a card needs no badge, chip or
label**. Nothing else may be added to it.

## Leaves

Behind each class sits the leaf of the plant it comes from, as flat silhouettes with no outline.

- **Two shapes, and the difference is real information.** Narrow *sinensis* for green, yellow,
  white, oolong, red and other; broad *assamica* for dark, because that is the plant pu-erh is
  actually made from.
- **Two or three per section**, descending in size, at opacities `.17 / .10 / .06`, rotated between
  −16° and +14°, anchored alternately left and right by section index so no two sections repeat.
- They bleed off the edge of the screen. They are never contained, never bordered, never centred.
- **Ghosting.** The section nearest 42% of the viewport height draws its leaves at full strength;
  every other section rests at **`.14`**. The transition is `.85s cubic-bezier(.22,.61,.36,1)` and
  is driven by scroll position, never by a timer.
- Under `prefers-reduced-motion: reduce`, the transition is removed; the states themselves remain.

## Layout & Spacing

Mobile-first, one-handed. Screen padding `18px`. Section padding `10px` top, `22px` bottom. Row
padding `8px` vertical with a `14px` gap. The gauge column is `52px` wide.

The shelf header is sticky, on a gradient of `field` fading to transparent, so names pass under it
rather than colliding with it. The add-a-tea control is a 52px circle at the bottom right, inside
thumb reach.

A tea's page groups its fields under three sentence-case headings — *Where it's from*, *What it
cost*, *On the shelf* — then Notes. Labels sit left in `ink-lo`, values right in `ink`, separated
by a `hairline`. Price per gram is derived beneath what you paid, never stored and never a field
of its own.

## Elevation & Shapes

No shadows on content — on a near-black ground they read as smudges. The only elevated surfaces are
sheets, which sit on `raised` with a `#33291F` top edge, a `14px` top radius, a 34×3px grab handle,
and a single deep shadow to lift them off the page.

Otherwise **nothing is a box**: no card borders, no outlines, no panels. Structure comes from the
leaves, the space and the alignment. Radii exist only on sheets (14px top), chips (14px, so they
read as tokens rather than buttons) and filled actions (3px).

## Motion

Three moments, all answering something the person did:

1. Leaves fading as a class comes into view (`.85s`).
2. A sheet rising — grams editor, picker, add-a-node (`.22s` ease-out).
3. A gauge redrawing when grams change (`.3s`), so the change is visible rather than instant.

No entrance animations, no hover transitions on rows, no ambient motion. Nothing moves unless the
person moved first.

## Do's and Don'ts

**Do**

- Let the gauge carry class and quantity. If something needs saying about a tea, ask whether the
  gauge already says it.
- Keep Chinese present and secondary.
- Let leaves run off the edge.
- Use sentence case everywhere.

**Don't**

- Colour anything that isn't a tea's liquor. No coloured buttons, no coloured errors, no dock gold.
- Add a badge, chip or pill to a tea on the shelf.
- Order the classes by anything but the Chinese classification's own order.
- Put a border or a shadow around a tea.
- Use a sans-serif, a monospace, or all-caps.
- Animate anything the person didn't cause.
