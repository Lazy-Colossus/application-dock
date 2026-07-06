---
title: "Hotaru — Visual Identity (DESIGN.md)"
status: final
created: 2026-06-10
updated: 2026-06-12
sources:
  - ../../prds/prd-application-dock-2026-06-10/prd.md
  - ../../briefs/brief-application-dock-2026-06-10/brief.md
  - .decision-log.md
  - mockups/drill-and-picker.html
  - mockups/home.html
  - mockups/library.html
  - mockups/add-word.html
  - mockups/word-notes.html
inherits_ui_system: "Vue 3 + Quasar v2 (Material-based)"
name: Hotaru
description: "Japanese vocabulary practice inside the Application Dock shell. A warm forest-twilight world lit by drifting fireflies; the word you're learning glows like a lamp in the dusk. Quietly alive, never gamified — no streaks, no leaderboards, no due-counts."
colors:
  # --- Field / background (the twilight forest floor; full-bleed, never a card) ---
  field-base: '#292d1a'        # warm moss green-brown ground
  field-low: '#1a1d10'         # deep humus floor (radial gradient bottom)
  field-glow: '#343721'        # warm moss haze (radial gradient top)
  field-deep: '#181b0e'        # screen-gradient floor low
  # --- Washi / beige surfaces (translucent panels laid on the field) ---
  surface-washi: '#ece1c8'     # warm sand
  surface-washi-hi: '#f6efda'  # raised washi (menu solids, panel highlights)
  # --- Ink (text on light surfaces) ---
  ink: '#34301f'              # warm dark bark
  ink-soft: '#6b6249'          # muted bark
  # --- Cream text (on the dark field) ---
  cream: '#ece1c8'            # beige body text on dark
  cream-soft: '#c6cd9a'        # warm sage caption
  sage: '#a3b178'             # dim sage label / meta
  # --- Bamboo green: PRIMARY accent (brand glyph, headings, CTA, prompt label) ---
  bamboo: '#8caf5d'           # primary accent
  bamboo-bright: '#a8cc6e'    # brighter bamboo — labels/links on dark
  bamboo-deep: '#5d7d38'      # pressed / strong (CTA shadow)
  bamboo-on: '#22260f'        # ink used on bamboo fills
  # --- Firefly glow (motion layer) ---
  firefly: '#fff0a8'          # firefly dot / halo
  firefly-core: '#fffce0'     # hot center
  # --- Lamp yellow: the practiced JP word — brightest element, "a lamp glowing in the dusk" ---
  lamp-yellow: '#ffd24a'
  # --- Familiarity ramp (5 tiers, new → mastered). Colour is NEVER the sole signal. ---
  fam-1-new: '#e4a59e'         # pastel rose
  fam-2-learning: '#eebf86'    # peach
  fam-3-familiar: '#d2d088'    # yellow-green
  fam-4-strong: '#a6c87e'      # light-green
  fam-5-mastered: '#7aa44d'    # bamboo
  # --- Private-note / aging accent (warm amber, distinct from lamp-yellow) ---
  amber-private: '#e0b27a'
typography:
  # Inherits Quasar's Roboto-based type ramp. Hotaru does NOT swap the Latin font;
  # it uses the platform system stack with a CJK fallback (see Typography). A chosen
  # Japanese-capable display font is a TBD (see note below).
  font-stack:
    note: 'System stack from the mocks — -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, then CJK fallback "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif. Japanese display font is TBD.'
  brand:
    fontSize: 17px
    fontWeight: '600'
    letterSpacing: 0.04em
  prompt:
    fontSize: 34px
    fontWeight: '600'
  jp-drill:
    fontSize: 46px
    fontWeight: '700'
    lineHeight: '1.05'
  jp-detail:
    fontSize: 48px
    fontWeight: '600'
    lineHeight: '1.05'
  jp-row:
    fontSize: 24px
    lineHeight: '1.1'
  reading:
    fontSize: 17px
  body:
    fontSize: 13px
    lineHeight: '1.45'
  label-caps:
    fontSize: 11px
    fontWeight: '600'
    letterSpacing: 0.16em
    note: 'uppercase — prompt label / section tags'
  caption:
    fontSize: 12px
  pill:
    fontSize: 8.5px
    letterSpacing: 0.02em
    note: 'category pill text; word-detail tag pill is 9px'
rounded:
  # Extends Quasar radii. Panels are softer than Quasar's default card; pills/CTAs are fully round.
  field-panel: 18px    # washi panels (drill reveal, header card, action tile, rest panel)
  input: 12px          # text inputs / selects
  reveal: 18px         # drill reveal panel
  note: 10px           # note callout
  grade: 14px          # grade buttons
  list: 14px           # library list container
  full: 9999px         # pills, CTAs, FAB, avatars
spacing:
  # Quasar's 4px base scale is inherited. These are the recurring named gaps from the mocks.
  screen-pad-x: 24px       # content horizontal padding (20px on dense list/form screens)
  screen-pad-top: 6px
  appbar-pad: '30px 22px 8px'
  panel-pad: '24px 16px'   # drill reveal interior
  row-pad-y: 13px          # word row / aging row vertical padding
  pill-gap: 5px
  grade-gap: 9px
components:
  app-bar:
    brand-glyph-glow: 'drop-shadow(0 0 12px rgba(140,175,93,.7))'   # {colors.bamboo}
    name: '{typography.brand}'
    avatar-size: 38px
  avatar:
    size: 38px
    radius: '{rounded.full}'
    ring: '2px solid rgba(246,239,218,.35)'
    text: '{colors.bamboo-on}'
    bg-jake: '{colors.fam-4-strong}'
    bg-dani: '{colors.fam-2-learning}'
    note: 'per-user fill assigned from the familiarity-ramp hues; not semantic'
  washi-panel:
    radius: '{rounded.field-panel}'
    z: 1
    backdrop-filter: 'blur(2px)'   # drill reveal & word header use blur(3px)
    bg: 'linear-gradient(165deg, rgba(45,49,28,.5), rgba(38,42,24,.42))'
    border: '1px solid rgba(140,175,93,.34)'
    inset-highlight: 'inset 0 1px 0 rgba(255,255,255,.10)'
    note: 'Translucent so the firefly layer (z:4) behind it reads ~50% dimmer.'
  drill-card:
    radius: '{rounded.reveal}'
    z: 1
    backdrop-filter: 'blur(3px)'
    border: '1px solid rgba(140,175,93,.5)'
    ambient-glow: '0 0 34px rgba(255,217,138,.20), 0 0 14px rgba(255,217,138,.14)'
    drop-shadow: '0 14px 34px rgba(0,0,0,.5)'
    jp-color: '{colors.lamp-yellow}'
    jp-glow: '0 0 22px rgba(255,206,74,.85), 0 0 46px rgba(255,196,70,.5)'
  familiarity-icon:
    note: 'DISTINCT icon per tier (NOT a pill). Icon set is PLACEHOLDER/TBD. Colour + icon + text label always together — colour is never the sole signal.'
    size: 16px              # 17px in library rows, 18px in word-detail header
    glow: 'drop-shadow(0 0 6px <tier-color>)'
    tier-1: '{colors.fam-1-new}'
    tier-2: '{colors.fam-2-learning}'
    tier-3: '{colors.fam-3-familiar}'
    tier-4: '{colors.fam-4-strong}'
    tier-5: '{colors.fam-5-mastered}'
  category-pill:
    radius: '{rounded.full}'
    font: '{typography.pill}'
    pad: '2px 7px'
    color: '#cdd6a3'
    bg: 'rgba(140,175,93,.16)'
    border: '1px solid rgba(140,175,93,.34)'
    note: 'Tiny, lined along the BOTTOM EDGE of the word card. Overflow → "＋N" expand toggle (CSS-only in mock).'
  category-overflow-toggle:
    color: '{colors.bamboo-bright-ish}'   # #e3ecc4 in mock
    bg: 'rgba(140,175,93,.3)'
    border: '1px solid rgba(140,175,93,.55)'
    label-expand: '＋N'
    label-collapse: '− less'
  grade-button:
    radius: '{rounded.grade}'
    text: '{colors.ink}'
    shadow: '0 6px 16px rgba(0,0,0,.35)'
    incorrect-bg: '{colors.fam-1-new}'
    close-bg: '{colors.fam-2-learning}'
    correct-bg: '{colors.fam-4-strong}'
    note: 'Three buttons: Incorrect / Close / Correct. NO subtext.'
  cta-button:
    radius: '{rounded.full}'
    bg: '{colors.bamboo}'
    text: '{colors.bamboo-on}'
    shadow: '0 10px 24px rgba(93,125,56,.55)'
  fab:
    radius: '{rounded.full}'
    bg: '{colors.bamboo}'
    text: '{colors.bamboo-on}'
  word-row:
    pad-y: '{spacing.row-pad-y}'
    divider: '1px solid rgba(140,175,93,.18)'
    jp: '{typography.jp-row}'
    jp-color: '#e6ddc4'
    en-color: '{colors.cream}'
  note-callout:
    radius: '{rounded.note}'
    bg: 'rgba(140,175,93,.18)'
    border-left: '3px solid {colors.bamboo}'
    private-bg: 'rgba(224,178,122,.14)'
    private-border-left: '3px solid {colors.fam-2-learning}'
    private-lock-color: '{colors.amber-private}'
    note: 'Shared is implicit default (no badge). Private notes show a 🔒 lock only.'
  firefly-layer:
    z: 4
    dot-bg: 'radial-gradient(circle, {colors.firefly-core} 0%, {colors.firefly} 40%, transparent 72%)'
    halo: 'radial-gradient(circle, rgba(255,240,168,.45) 0%, transparent 70%) blur(5px)'
    motion: 'sparse, slow, wandering looping paths (21–31s) + slow blink'
    reduced-motion: 'static dim dots, opacity .5, no travel'
    note: 'Renders BEHIND content panels; reads ~50% dimmer over translucent cards, full over plain field.'
---

This DESIGN.md is the **visual identity contract** for Hotaru. It **extends the Application Dock UI system (Vue 3 + Quasar v2, Material-based)** — it specifies only the brand-layer deltas: palette, panel radii, the firefly/glow motifs, and Hotaru-specific components. Anything Quasar already provides (the 4px spacing base, ripple, default elevation curve, `QInput`/`QBtn`/`QMenu`/`QAvatar` mechanics, focus rings) is inherited and **not** restated here. Where a token below conflicts with a Quasar default, this file describes the override; where it's silent, Quasar wins.

## Brand & Style

Hotaru ("firefly", 蛍) is a warm, quietly-alive place to practice Japanese vocabulary. The screen is a **forest floor at summer twilight** — earthy moss green-brown, washi-paper panels, bamboo-green light — with **sparse fireflies drifting on slow wandering paths**. The word you're practicing is the brightest thing on screen: it glows a warm **lamp-yellow**, like a lamp in the dusk. The fireflies and the lamp-yellow word together evoke **蛍雪** ("firefly snow" — the classical image of studying by firefly-light) — so the fireflies read as the study-lamp motif, not mere decoration.

The posture is **serene but playful** — calm is the *manner*, not the mission. Hotaru is built against the grain of habit-app pressure: **no streaks, no leaderboards, no due-counts, no re-engagement nudges.** Showing up and meeting a few words is enough. The fireflies, the glow, and the soft warm palette do the emotional work; the copy stays warm, clear, and encouraging toward effective practice rather than leaning on "calm / gentle / serene" filler.

Layout is **mobile-web, phone-viewport, single-column, full-bleed** — no floating-card-in-a-frame. The forest field is the canvas; content sits directly on it in translucent washi panels. Illustrated mock: [`mockups/drill-and-picker.html`](mockups/drill-and-picker.html).

## Colors

The palette is a warm earthy twilight, not a clinical dark theme. It is layered: a dark **field** behind, **washi** panels on top, **bamboo** as the single brand accent, and two reserved glows (firefly + lamp).

- **Field** — `field-base #292d1a` warm moss green-brown ground, deepening to `field-low #1a1d10` at the floor and lifting to `field-glow #343721` haze at the top. Used full-bleed as the page/screen background via a radial gradient; never a card surface. `field-deep #181b0e` is the screen-gradient's lowest stop.
- **Washi** — `surface-washi #ece1c8` (warm sand) and `surface-washi-hi #f6efda` (raised). Translucent washi is the substrate for all content panels; solid washi is reserved for the avatar menu popover.
- **Ink** — `ink #34301f` (warm bark) for text on washi surfaces and on bamboo/grade fills; `ink-soft #6b6249` for secondary text on washi.
- **Cream / sage** — text *on the field*: `cream #ece1c8` body, `cream-soft #c6cd9a` captions/readings, `sage #a3b178` dim meta/labels.
- **Bamboo (PRIMARY accent)** — `bamboo #8caf5d` is the brand colour: glyph glow, CTAs, FAB, note accent bar, heading hints. `bamboo-bright #a8cc6e` for labels/links/arrows on the dark field; `bamboo-deep #5d7d38` for CTA shadow depth; `bamboo-on #22260f` is the ink placed on bamboo fills.
- **Firefly** — `firefly #fff0a8` dot + halo, `firefly-core #fffce0` hot center. A motion-layer colour only; never a UI fill.
- **Lamp-yellow `#ffd24a`** — reserved for **one thing**: the practiced Japanese word on the drill card, the brightest element on screen, carrying a warm yellow text-glow. Never used for chrome, state, or decoration.
- **Familiarity ramp** — five fixed hues, new→mastered: `fam-1-new #e4a59e` rose · `fam-2-learning #eebf86` peach · `fam-3-familiar #d2d088` yellow-green · `fam-4-strong #a6c87e` light-green · `fam-5-mastered #7aa44d` bamboo. These hues are also reused for the grade buttons (Incorrect=rose, Close=peach, Correct=light-green) and per-user avatar fills. **Colour is never the only signal** — always paired with an icon and a text label.
- **Amber-private `#e0b27a`** — the private/aging accent: 🔒 lock on private notes, "softening/resting" age text, private-scope marks. Distinct from `lamp-yellow` (which is the word) and `firefly` (which is motion).

Avoid: any colour outside these families; using `lamp-yellow` for anything but the practiced word; using firefly colour as a fill; using a familiarity hue without its icon + label.

## Typography

Hotaru **inherits Quasar's Roboto-based Material type ramp** and does not swap the Latin typeface. The mocks render from the platform **system stack** (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, …`) with a **system CJK fallback** appended for Japanese glyphs: `"Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif`. This means Japanese renders in whatever CJK face the OS provides — acceptable for the mock, but **a chosen Japanese-capable webfont (e.g. a Noto Sans JP / Zen-family choice) is a TBD** and must be locked before build so the 約束-scale display glyphs are consistent across devices.

Type roles (sizes pulled from the mocks):

- **Japanese display** is the loudest role and scales by context: `jp-drill` 46px/700 on the drill card (lamp-yellow + glow), `jp-detail` 48px/600 in the word-detail header (bamboo-bright `#bcd58a`), `jp-row` 24px in library/aging rows.
- **Prompt** 34px/600 (the English cue on the drill front, e.g. "promise").
- **Brand** 17px/600, letter-spacing .04em (the "Hotaru" wordmark beside the 蛍 glyph).
- **Reading** 17px (furigana/romaji line); **body** 13px/1.45 (notes, descriptions); **caption** 12px.
- **label-caps** 11px/600, letter-spacing .16em, uppercase — prompt label and section tags.
- **Pill** text is intentionally tiny: 8.5px for category pills (9px for word-detail tag pills).

Numerals that count (progress "7 / 20", tier counts) use tabular figures.

## Layout & Spacing

The 4px Quasar spacing base is inherited; Hotaru just names the gaps it leans on. Every screen is **single-column, full-bleed phone** — the radial field gradient fills the viewport edge-to-edge and content floats on it. No desktop/wide layouts; no framed cards-in-a-window.

- App bar: padding `30px 22px 8px`, brand left / avatar (or progress) right.
- Content: horizontal padding `24px` on focal screens (drill, home), tightening to `20px` on dense screens (library, add-word, word-notes); top padding `6px`.
- Drill reveal interior padding `24px 16px`; word rows and aging rows use `13px` vertical padding with a hairline divider.
- Pills sit in a `5px`-gap wrap; grade buttons in a `9px`-gap equal-width row.
- A calm footer pins to the bottom via `margin-top:auto`.

Illustrated: [`mockups/library.html`](mockups/library.html), [`mockups/add-word.html`](mockups/add-word.html).

## Elevation & Depth

Depth is **tonal + glow**, layered on a fixed z-stack — not Material drop-shadow hierarchy.

The z-order is load-bearing: **field gradient (back) → firefly layer (z:4) → content & panels (z:5, panels themselves z:1 within content) → avatar menu (z:8)**. Because panels are translucent and sit *above* the firefly layer, fireflies drifting behind a panel read **~50% dimmer**, while fireflies over the plain field stay full brightness — this is the core depth effect, achieved with z-index + panel translucency, no extra shadows.

- **Washi panels** lift off the field by tone + a thin bamboo border + a faint top inset highlight (`inset 0 1px 0 rgba(255,255,255,.10)`), with a small `blur(2–3px)` backdrop.
- **The drill card** is the one true focal elevation: a soft **warm amber ambient glow** (`0 0 34px rgba(255,217,138,.20)` + `0 0 14px rgba(255,217,138,.14)`) plus a real drop shadow (`0 14px 34px rgba(0,0,0,.5)`). The practiced word adds its own lamp glow on top.
- **Glow as accent, not chrome:** firefly halos, the brand glyph's bamboo drop-shadow, and familiarity-icon glows are all soft and small; only the drill card and the practiced word are allowed to glow strongly.

## Shapes

Corners are **soft and warm**, softer than Quasar's default card radius:

- `field-panel` / `reveal` **18px** for all washi panels (drill reveal, word header, home action tiles, rest panel) — the signature soft-rounded panel.
- `input` **12px** for text fields/selects; `list` **14px** for the library list container; `grade` **14px** for grade buttons; `note` **10px** for note callouts.
- `full` **9999px** for everything pill-shaped: category pills, CTAs, the FAB, avatars, scope toggles, the "Let's practice →" button.

The logic: large panels read like soft paper objects; interactive affordances (pills, CTAs) read fully rounded and friendly. Nothing is sharp-cornered.

## Components

Illustrated primarily by [`mockups/drill-and-picker.html`](mockups/drill-and-picker.html) (drill, picker, ramp, rest), with home/library/add/notes in the other mocks.

- **Drill card** (`.reveal`) — the elevated focal element. Translucent washi panel (`rounded/reveal` 18px) with `blur(3px)` backdrop, a bamboo border at .5 alpha, soft **warm amber ambient glow** + drop shadow. Holds the practiced **Japanese word in lamp-yellow `#ffd24a`** at 46px/700 with a warm yellow text-glow (brightest element on screen), then reading (`cream-soft`) and meaning (`bamboo-bright`, italic). Category pills line its bottom edge. Fireflies behind it read ~half-bright.
- **Familiarity icon** — a **distinct icon per tier** (NOT a pill — pills are for categories). Five levels, glowing in the tier hue with a small `drop-shadow`. **The icon set is a PLACEHOLDER/TBD** (mock uses geometric glyphs ◉ / ○◔◑◕●); what's locked is the **5 levels, the colour ramp, and the rule that colour + icon + text label always appear together** (accessibility — colour is never the sole signal). Sizes: 16px on the drill toprow, 17px in library rows, 18px in the word-detail header. Appears consistently on drill card, library rows, and word-detail header.
- **Category pill + overflow toggle** — tiny (`8.5px`), fully-rounded chips in bamboo-tinted translucent fill, **lined along the bottom edge of the word card** above a hairline rule. On overflow they collapse behind a brighter **"＋N" toggle** (mock uses a CSS checkbox-hack, no JS) that expands to reveal the rest and swaps its label to "− less". Visually distinct from the familiarity icon.
- **Grade buttons** — three equal-width buttons in a `9px`-gap row: **Incorrect** (`fam-1-new` rose) · **Close** (`fam-2-learning` peach) · **Correct** (`fam-4-strong` light-green), ink text, `rounded/grade` 14px, soft shadow. **No subtext** — single word each.
- **Top-bar avatar / switcher** — 38px circular `QAvatar`, fully round, washi ring (`2px rgba(246,239,218,.35)`), filled with a familiarity-ramp hue per user (Jake = light-green, Dani = peach; decorative, not semantic). Tapping opens a solid-washi `QMenu` popover (`surface-washi-hi`, with a caret) listing **Switch user** + **Settings**. See [`mockups/home.html`](mockups/home.html).
- **Word row** (`.wrow`) — library list item: Japanese (24px, `#e6ddc4`) with small reading beneath, English meaning (`cream`), optional category/scope badge, a familiarity icon at the end, hairline divider between rows. Shared/private marked with the amber-private badge. See [`mockups/library.html`](mockups/library.html).
- **Washi panel** (`.reveal` / `.whead` / `.action` / `.empty` / library `.list`) — the generic translucent content surface described in Elevation: `rounded/field-panel` 18px, `blur(2px)` backdrop, bamboo border, top inset highlight, sits at z:1 above the firefly layer so fireflies behind it dim ~50%.
- **Firefly layer** — sparse, slow, **wandering** CSS dots at **z:4**, each a `firefly`/`firefly-core` radial dot with a soft blurred halo, drifting on long looping paths (21–31s) with a slow blink. Renders **behind all content panels**; full brightness over the plain field, ~50% over translucent cards. **`prefers-reduced-motion` → static dim dots** (opacity .5, no travel, dimmed halo).

Supporting components seen in the mocks (inherit Quasar mechanics, brand-tinted): note callout (shared = no badge / implicit default; private = amber-private bg + 🔒 lock only — see [`mockups/word-notes.html`](mockups/word-notes.html)), inputs/selects/toggles in `add-word`, primary CTA + FAB in bamboo.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Reserve `lamp-yellow #ffd24a` + warm glow for the **practiced Japanese word only** | Use lamp-yellow for chrome, buttons, state, or any decoration |
| Use **bamboo** as the single brand accent (CTAs, FAB, brand glyph, note bar) | Introduce a second brand colour or use firefly colour as a fill |
| Render the familiarity ramp as **colour + distinct icon + text label** | Rely on colour alone, or reuse the category-pill style for familiarity |
| Keep **familiarity icon ≠ category pill** — different shape, placement, purpose | Style familiarity as a pill, or scatter category pills as familiarity signals |
| Keep grade buttons to single words: **Incorrect / Close / Correct** | Add per-grade subtext or a fourth grade |
| Keep fireflies **sparse, slow, behind panels**, with a reduced-motion fallback | Make them dense/fast, place them above content, or omit the static fallback |
| Let calm be the **manner** — warm, clear, encouraging-toward-practice copy | Over-index on "calm / gentle / serene" filler wording |
| Be **full-bleed, single-column, phone** on the forest field | Build framed cards-in-a-window, desktop/wide layouts, or opaque dark cards |
| Inherit Quasar for spacing, ripple, inputs, menus, focus | Restate or fight Quasar defaults this file doesn't override |
| Honor the no-pressure stance | Add streaks, leaderboards, due-counts, or re-engagement nudges |

---

*The spines win on conflict with any mock: where a mock and this DESIGN.md (or the decision log / EXPERIENCE.md) disagree, the spine is authoritative — the `mockups/*.html` are illustrative references, not the contract.*
