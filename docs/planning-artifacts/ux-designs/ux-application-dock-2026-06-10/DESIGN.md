---
title: "Hotaru — Visual Identity (DESIGN.md)"
status: final
created: 2026-06-10
updated: 2026-07-06
identity: "Neon Yūgure"
sources:
  - ../../prds/prd-application-dock-2026-06-10/prd.md
  - ../../briefs/brief-application-dock-2026-06-10/brief.md
  - .decision-log.md
  - .working/direction-neon-yugure.html
  - mockups/drill-and-picker.html
  - mockups/home.html
  - mockups/library.html
  - mockups/add-word.html
  - mockups/word-notes.html
  - mockups/session-summary.html
inherits_ui_system: "Vue 3 + Quasar v2 (Material-based)"
name: Hotaru
description: "Japanese vocabulary practice inside the Application Dock shell. A deep-indigo dusk field (夕暮れ) lit by saturated neon — electric cyan, hot magenta, neon violet — with a few amber fireflies drifting behind violet glass. Nightlife sparkle over a quiet late-evening field; the word you're learning glows cyan like a sign in the dark. Quietly alive, never gamified — no streaks, no leaderboards, no due-counts."
colors:
  # --- Field / background (deep indigo dusk; full-bleed, never a card) ---
  field-0: '#04060f'           # deepest dusk (gradient floor)
  field-1: '#0a0a24'           # mid indigo (gradient body)
  field-2: '#1a1148'           # violet haze (gradient top)
  field-raise: '#11132e'       # raised solid surface (menu popover)
  # --- Glass (violet-tinted translucent panels laid on the field) ---
  glass: 'rgba(20,18,52,0.55)' # card / panel fill; pairs with blur(16px)
  glass-line: 'rgba(155,107,255,0.28)'  # violet panel border
  # --- Ink (text on the dark field) ---
  ink-hi: '#f1f0ff'            # high-emphasis body / headings
  ink-mid: '#b3aede'           # secondary text / readings-support
  ink-lo: '#6f6aa0'            # tertiary / hint / meta
  # --- Cyan: PRIMARY neon accent (brand glyph, CTA, active state, the practiced word) ---
  cyan: '#38f0e6'
  cyan-bright: '#7ff7ee'       # CTA gradient far stop / hover
  cyan-deep: '#10a89f'         # pressed / CTA shadow depth
  cyan-on: '#03121a'           # dark ink placed on cyan fills
  # --- Magenta: SECONDARY neon accent (reading, mastered tier, incorrect grade, aging) ---
  magenta: '#ff5cc8'
  # --- Violet: TERTIARY neon accent (panel edges, notes, learning tier, chip fills) ---
  violet: '#9b6bff'
  # --- Firefly amber (motion layer + strong tier + private/aging) ---
  amber: '#ffce5c'
  # --- Lamp-yellow: the 蛍 brand logo glow + kana (hiragana/katakana) glyphs ---
  lamp-yellow: '#ffd24a'
  # --- Familiarity ramp (5 tiers, new → mastered). Colour is NEVER the sole signal. ---
  fam-1-new: '#5a5a86'         # muted grey-violet (hollow ring ○)
  fam-2-learning: '#9b6bff'    # violet (◔)
  fam-3-familiar: '#38f0e6'    # cyan (◑)
  fam-4-strong: '#ffce5c'      # amber (◕)
  fam-5-mastered: '#ff5cc8'    # magenta (●)
  # --- Private/aging accent (warm amber; distinct from the neon accents) ---
  amber-private: '#ffce5c'
typography:
  # Inherits Quasar's Roboto-based Material type ramp. Hotaru does NOT swap the
  # Latin typeface; it uses the platform system stack with a CJK fallback (see
  # Typography). A chosen Japanese-capable display font is a TBD.
  font-stack:
    note: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", Meiryo, system-ui, sans-serif. Japanese display font is TBD.'
  brand:
    fontSize: 18px
    fontWeight: '700'
    letterSpacing: 0.02em
  prompt:
    fontSize: 34px
    fontWeight: '700'
  jp-drill:
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    note: 'cyan + glow — the brightest element on the drill card'
  jp-detail:
    fontSize: 48px
    fontWeight: '600'
    lineHeight: '1.05'
  jp-row:
    fontSize: 24px
    lineHeight: '1.1'
  reading:
    fontSize: 20px
    note: 'magenta on the drill card; ink-mid elsewhere'
  body:
    fontSize: 13px
    lineHeight: '1.45'
  label-caps:
    fontSize: 11px
    fontWeight: '600'
    letterSpacing: 0.16em
    note: 'uppercase — prompt label / section tags / mode toggle'
  caption:
    fontSize: 12px
  pill:
    fontSize: 8.5px
    letterSpacing: 0.02em
    note: 'category pill text; word-detail tag pill is 9px'
rounded:
  field-panel: 20px    # glass panels (drill reveal, header card, action tile, list)
  input: 12px          # text inputs / selects
  reveal: 20px         # drill reveal panel
  note: 14px           # note callout
  grade: 14px          # grade buttons
  list: 20px           # library list container
  full: 9999px         # pills, CTAs, FAB, avatars, mode toggle
spacing:
  screen-pad-x: 22px       # content horizontal padding (18px on dense list/form screens)
  screen-pad-top: 6px
  appbar-pad: '30px 22px 8px'
  panel-pad: '20px 18px'   # glass panel interior
  row-pad-y: 13px          # word row / aging row vertical padding
  pill-gap: 5px
  grade-gap: 9px
components:
  app-bar:
    brand-glyph: '{colors.lamp-yellow}'
    brand-glyph-glow: '0 0 16px rgba(255,210,74,.75)'  # lamp-yellow text-shadow on 蛍
    name: '{typography.brand}'
    avatar-size: 38px
    progress-bar: 'linear-gradient(90deg, {colors.cyan}, {colors.magenta}); glow 0 0 12px rgba(56,240,230,.8)'
  avatar:
    size: 38px
    radius: '{rounded.full}'
    ring: '2px solid rgba(241,240,255,.20)'
    text: '{colors.cyan-on}'
    bg-dani: '{colors.fam-2-learning}'   # violet
    bg-jake: '{colors.fam-4-strong}'     # amber
    note: 'per-user fill from the familiarity-ramp hues; decorative, not semantic'
  glass-panel:
    radius: '{rounded.field-panel}'
    z: 1
    backdrop-filter: 'blur(16px)'
    bg: '{colors.glass}'
    border: '1px solid {colors.glass-line}'
    inset-highlight: 'inset 0 1px 0 rgba(255,255,255,.06)'
    shadow: '0 18px 44px rgba(0,0,0,.55), 0 0 40px rgba(155,107,255,.12)'
    note: 'Translucent + heavy blur so the firefly layer behind it blooms through, dimmer over the card, full over the plain field.'
  drill-card:
    radius: '{rounded.reveal}'
    z: 1
    backdrop-filter: 'blur(16px)'
    bg: '{colors.glass}'
    border: '1px solid {colors.glass-line}'
    ambient-glow: '0 0 40px rgba(155,107,255,.16), 0 0 40px rgba(56,240,230,.10)'
    drop-shadow: '0 18px 44px rgba(0,0,0,.55)'
    jp-color: '{colors.cyan}'
    jp-glow: '0 0 30px rgba(56,240,230,.6), 0 0 14px rgba(56,240,230,.5)'
    reading-color: '{colors.magenta}'
    reading-glow: '0 0 16px rgba(255,92,200,.5)'
    meaning-color: '{colors.ink-mid}'
  familiarity-icon:
    note: 'DISTINCT icon per tier (NOT a pill). Icon set is PLACEHOLDER/TBD (mock uses ○◔◑◕●). Colour + icon + text label always together — colour is never the sole signal. "New" (tier 1 here) means NEVER STUDIED; once a word is reviewed (any grade) it is at least Learning — a lapse floors at Learning, never back to New.'
    size: 16px              # 17px in library rows, 18px in word-detail header
    glow: 'drop-shadow(0 0 8px <tier-color>) — new tier is an unglowing hollow ring'
    tier-1: '{colors.fam-1-new}'
    tier-2: '{colors.fam-2-learning}'
    tier-3: '{colors.fam-3-familiar}'
    tier-4: '{colors.fam-4-strong}'
    tier-5: '{colors.fam-5-mastered}'
  category-pill:
    radius: '{rounded.full}'
    font: '{typography.pill}'
    pad: '2px 7px'
    color: '#cdc6f0'
    bg: 'rgba(155,107,255,.16)'
    border: '1px solid rgba(155,107,255,.34)'
    note: 'Tiny, lined along the BOTTOM EDGE of the word card. Overflow → "＋N" expand toggle (CSS-only in mock).'
  category-overflow-toggle:
    color: '#e7e0ff'
    bg: 'rgba(155,107,255,.3)'
    border: '1px solid rgba(155,107,255,.55)'
    label-expand: '＋N'
    label-collapse: '− less'
  grade-button:
    radius: '{rounded.grade}'
    bg: 'rgba(255,255,255,.04)'
    text: '{colors.ink-hi}'
    incorrect: 'magenta edge — border rgba(255,92,200,.55), glow 0 0 22px rgba(255,92,200,.2), label {colors.magenta}'
    close: 'amber edge — border rgba(255,206,92,.6), glow 0 0 22px rgba(255,206,92,.22), label {colors.amber}'
    correct: 'cyan edge — border rgba(56,240,230,.6), glow 0 0 22px rgba(56,240,230,.22), label {colors.cyan}'
    note: 'Three buttons: Incorrect / Close / Correct. NO subtext. Order left→right is a design choice; EXPERIENCE.md owns placement.'
  cta-button:
    radius: '{rounded.full}'
    bg: 'linear-gradient(90deg, {colors.cyan}, {colors.cyan-bright})'
    text: '{colors.cyan-on}'
    shadow: '0 0 32px rgba(56,240,230,.65)'
    note: 'e.g. "Let’s practice ✦" / "Begin ✦". The ✦ spark is the CTA affordance mark.'
  fab:
    radius: '{rounded.full}'
    bg: '{colors.cyan}'
    text: '{colors.cyan-on}'
    glow: '0 8px 22px rgba(0,0,0,.5), 0 0 20px rgba(56,240,230,.4)'
  library-tabs:
    z: 1
    radius: '{rounded.full}'
    section-active: '{colors.cyan} fill, {colors.cyan-on} ink, glow 0 0 14px rgba(56,240,230,.35)'
    section-idle: 'violet-tint pill — rgba(155,107,255,.12) fill, rgba(155,107,255,.30) border, {colors.ink-mid} text'
    subsection-active: '{colors.violet} fill, #140a2e ink, glow 0 0 14px rgba(155,107,255,.45)'
    subsection-idle: 'the violet-tint idle pill, smaller (12px)'
    note: 'Two-level library filter nav. Level-1 sections = cyan (primary). Level-2 subsections = violet (tertiary → subordinate) and smaller, to encode hierarchy. Both fully rounded.'
  word-row:
    pad-y: '{spacing.row-pad-y}'
    divider: '1px solid rgba(155,107,255,.16)'
    jp: '{typography.jp-row}'
    jp-kanji-color: '{colors.cyan} + text-glow rgba(56,240,230,.4)'      # kanji headword
    jp-kana-color: '{colors.lamp-yellow} + text-glow rgba(255,210,74,.4)' # kana-only headword
    reading-color: '{colors.lamp-yellow}'                                 # the hiragana reading line
    en-color: '{colors.ink-mid}'
    private-mark: '🔒 {colors.amber-private}'
  note-callout:
    radius: '{rounded.note}'
    bg: 'rgba(155,107,255,.10)'
    border: '1px solid rgba(155,107,255,.32)'
    author-color: '{colors.violet}'
    author-glow: '0 0 10px rgba(155,107,255,.5)'
    private-bg: 'rgba(255,206,92,.10)'
    private-border: '1px solid rgba(255,206,92,.32)'
    private-lock-color: '{colors.amber-private}'
    note: 'Shared is implicit default (violet). Private notes carry an amber tint + 🔒 lock only.'
  firefly-layer:
    z: 4
    colours: '{colors.amber}, {colors.cyan}, {colors.magenta}'
    dot: 'solid rgb(<colour>) core with box-shadow bloom 0 0 8px 2px rgba(<colour>,.75), 0 0 20px 7px rgba(<colour>,.4)'
    motion: 'sparse-ish (a few more than forest), slow wandering looping paths (9–20s) + bloom pulse (scale + opacity)'
    reduced-motion: 'static dim dots, opacity .4, no travel'
    note: 'Renders BEHIND content panels (z below content); blooms through translucent glass dimmer, full over the plain field.'
---

This DESIGN.md is the **visual identity contract** for Hotaru. The current identity is **Neon Yūgure** (夕暮れ, "dusk") — the evening-neon direction. It **extends the Application Dock UI system (Vue 3 + Quasar v2, Material-based)**: it specifies only the brand-layer deltas — palette, panel radii, the firefly/glow motifs, and Hotaru-specific components. Anything Quasar already provides (4px spacing base, ripple, elevation curve, `QInput`/`QBtn`/`QMenu`/`QAvatar` mechanics, focus rings) is inherited and **not** restated here. Where a token below conflicts with a Quasar default, this file is the override; where it's silent, Quasar wins.

> **Prior identity (backup):** Hotaru first shipped a warm **forest-twilight** skin (moss field, washi panels, bamboo-green accent, lamp-yellow word). That direction is preserved in git (commit `c8458eb`, "forest-twilight atmospheric pass") and its explorations remain under `.working/direction-forest-*`. Neon Yūgure supersedes it as the canonical identity; the two share the same structure, motifs, and no-pressure stance — only the skin differs, so reverting is a token-and-helper swap in `apps/hotaru/css/hotaru.sass` (see Appendix).

## Brand & Style

Hotaru ("firefly", 蛍) is a warm, quietly-alive place to practice Japanese vocabulary. The screen is a **forest at summer dusk pushed into evening-neon** — a deep-indigo field, violet glass panels, and saturated **cyan / magenta / violet** light, with a few **amber fireflies drifting on slow wandering paths**. The word you're practicing is the brightest thing on screen: it glows **electric cyan**, like a sign lighting up in the dark. The fireflies and the glowing word together still evoke **蛍雪** ("firefly snow" — studying by firefly-light) — the fireflies read as the study-lamp motif, now lit like nightlife.

The posture is **serene but playful** — calm is the *manner*, not the mission. Neon adds a touch more visual energy (brighter bloom, a few more fireflies, saturated accents) while staying calm underneath: nightlife sparkle over a quiet late-evening field, never frantic or pressuring. Hotaru is built against habit-app pressure: **no streaks, no leaderboards, no due-counts, no re-engagement nudges.** Showing up and meeting a few words is enough. The glow and the soft indigo dark do the emotional work; the copy stays warm, clear, and encouraging toward effective practice rather than leaning on "calm / gentle / serene" filler.

Layout is **mobile-web, phone-viewport, single-column, full-bleed** — no floating-card-in-a-frame. The dusk field is the canvas; content sits directly on it in violet glass panels. Illustrated mock: [`mockups/drill-and-picker.html`](mockups/drill-and-picker.html).

## Colors

The palette is a saturated evening neon over a deep indigo dark. It is layered: a dark **field** behind, **violet glass** panels on top, **cyan** as the primary accent, **magenta** and **violet** as secondary/tertiary, and **amber** reserved for fireflies + the warm tiers.

- **Field** — a radial gradient from `field-2 #1a1148` (violet haze, top) through `field-1 #0a0a24` to `field-0 #04060f` (deepest dusk, floor). Full-bleed page background; never a card surface. `field-raise #11132e` is the one solid raised surface (avatar menu popover).
- **Glass** — `glass rgba(20,18,52,0.55)` violet-tinted translucent fill, always paired with `blur(16px)` and the `glass-line rgba(155,107,255,0.28)` violet border. The substrate for every content panel.
- **Ink** — text on the dark field: `ink-hi #f1f0ff` (headings/body), `ink-mid #b3aede` (secondary/readings-support), `ink-lo #6f6aa0` (hints/meta/labels).
- **Cyan (PRIMARY)** — `cyan #38f0e6` is the interface accent: CTAs, FAB, active tabs/chips, the mode toggle, and — reserved above all — **the practiced Japanese word**. (The 蛍 mark is *not* cyan; see Lamp-yellow.) `cyan-bright #7ff7ee` is the CTA gradient's far stop / hover; `cyan-deep #10a89f` for pressed depth; `cyan-on #03121a` is the dark ink placed on cyan fills.
- **Magenta (SECONDARY)** — `magenta #ff5cc8`: the reading line on the drill card, the Mastered tier, the Incorrect grade edge, and "aging / drifting back" marks.
- **Violet (TERTIARY)** — `violet #9b6bff`: panel edges, shared-note accent, the Learning tier, chip fills, category pills.
- **Amber** — `amber #ffce5c`: the literal firefly glow (motion layer), the Strong tier, the Close grade edge, and the private/aging accent (`amber-private`, same hue). Never a chrome fill.
- **Lamp-yellow** — `lamp-yellow #ffd24a`, a warm glowing yellow (a firefly against the neon dusk): the **蛍 brand logo** glow and **kana** (hiragana/katakana) glyphs in the word list. Distinct from the cooler `amber`; reserved for the logo + kana, not chrome.
- **Kanji vs kana colour split** — in the word list, **kanji** headwords glow **cyan** (`#38f0e6`) and **kana** glyphs glow **lamp-yellow** (`#ffd24a`) — both the kana-only headword and the hiragana reading line. This mirrors the drill card (Japanese = cyan) while giving kana its own warm read.
- **Familiarity ramp** — five fixed hues, new→mastered: `fam-1-new #5a5a86` grey-violet · `fam-2-learning #9b6bff` violet · `fam-3-familiar #38f0e6` cyan · `fam-4-strong #ffce5c` amber · `fam-5-mastered #ff5cc8` magenta. Reused for the grade buttons (Incorrect=magenta, Close=amber, Correct=cyan) and per-user avatar fills (Dani=violet, Jake=amber). **Colour is never the only signal** — always paired with an icon and a text label. **"New" means never studied** (`last_reviewed_at` unset): the moment a word is reviewed — whatever the grade — it becomes at least **Learning**, and a lapse floors at Learning rather than returning to New. So the New bucket is "words you haven't started", never "words you keep failing".

Avoid: any colour outside these families; using cyan for chrome unrelated to the primary-accent role while *also* using it for the practiced word in the same view without the word clearly reading brightest; using firefly amber as a solid UI fill; using a familiarity hue without its icon + label.

## Typography

Hotaru **inherits Quasar's Roboto-based Material type ramp** and does not swap the Latin typeface. The mocks render from the platform **system stack** with a **system CJK fallback** for Japanese glyphs (`"Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif`). A **Japanese-capable display webfont (e.g. a Noto Sans JP / Zen-family choice) is a TBD** and should be locked before build so the 48px display glyphs are consistent across devices.

Type roles:

- **Japanese display** is the loudest role and scales by context: `jp-drill` 48px/700 on the drill card (**cyan + glow**, the brightest element), `jp-detail` 48px/600 in the word-detail header, `jp-row` 24px in library/aging rows (`ink-hi`).
- **Prompt** 34px/700 (the English cue on the drill front, e.g. "promise") in `ink-hi`.
- **Brand** 18px/700, letter-spacing .02em (the "Hotaru" wordmark beside the lamp-yellow 蛍 glyph).
- **Reading** 20px (furigana/romaji) — **magenta + glow** on the drill card, `ink-mid` elsewhere; **body** 13px/1.45; **caption** 12px.
- **label-caps** 11px/600, letter-spacing .16em, uppercase — prompt label, section tags, the EN→JP mode toggle.
- **Pill** text is intentionally tiny: 8.5px for category pills (9px for word-detail tag pills).

Numerals that count (progress "7 / 20", tier counts) use tabular figures.

## Layout & Spacing

The 4px Quasar spacing base is inherited; Hotaru names the gaps it leans on. Every screen is **single-column, full-bleed phone** — the radial field gradient fills the viewport edge-to-edge and content floats on it. No desktop/wide layouts; no framed cards-in-a-window.

- App bar: padding `30px 22px 8px`, brand left / avatar (or drill progress) right.
- Content: horizontal padding `22px` on focal screens (drill, home), tightening to `18px` on dense screens (library, add-word, word-notes); top padding `6px`.
- Glass panel interior padding `20px 18px`; word rows and aging rows use `13px` vertical padding with a hairline divider.
- Pills sit in a `5px`-gap wrap; grade buttons in a `9px`-gap equal-width row.
- A footer pins to the bottom via `margin-top:auto`.

Illustrated: [`mockups/library.html`](mockups/library.html), [`mockups/add-word.html`](mockups/add-word.html).

## Elevation & Depth

Depth is **tonal + neon glow**, layered on a fixed z-stack — not Material drop-shadow hierarchy.

The z-order is load-bearing: **field gradient (back) → firefly layer (z:4) → content & panels (z:5, panels themselves z:1 within content) → avatar menu (z:8)**. Because panels are translucent violet glass sitting *above* the firefly layer, fireflies drifting behind a panel **bloom through dimmer**, while fireflies over the plain field stay full brightness — the core depth effect, achieved with z-index + glass translucency, no extra shadows.

- **Glass panels** lift off the field by tone + the violet border + a faint top inset highlight (`inset 0 1px 0 rgba(255,255,255,.06)`) + `blur(16px)`, with a soft violet edge-glow (`0 0 40px rgba(155,107,255,.12)`) and a real drop shadow (`0 18px 44px rgba(0,0,0,.55)`).
- **The drill card** is the focal elevation: the glass panel plus a dual **cyan+violet ambient glow** (`0 0 40px rgba(155,107,255,.16), 0 0 40px rgba(56,240,230,.10)`). The practiced word adds its own cyan text-glow on top — the brightest point on screen.
- **Glow as accent, not chrome:** firefly blooms, the brand glyph's lamp-yellow glow, familiarity-icon glows, and active-chip glows are all soft and contained; only the drill card and the practiced word glow strongly.

## Shapes

Corners are **soft and rounded**, a touch larger than Quasar's default card radius:

- `field-panel` / `reveal` / `list` **20px** for glass panels (drill reveal, word header, home action tiles, library list) — the signature rounded glass.
- `input` **12px** for text fields/selects; `grade` **14px** for grade buttons; `note` **14px** for note callouts.
- `full` **9999px** for everything pill-shaped: category pills, CTAs, the FAB, avatars, scope toggles, the mode toggle, the "Let's practice ✦" button.

Large panels read like slabs of lit glass; interactive affordances (pills, CTAs) read fully rounded and friendly. Nothing is sharp-cornered.

## Components

Illustrated primarily by [`mockups/drill-and-picker.html`](mockups/drill-and-picker.html) (drill, picker, ramp, aging row), with home/library/add/notes in the other mocks.

- **Drill card** (`.reveal`) — the elevated focal element. Violet glass panel (`rounded/reveal` 20px, `blur(16px)`, violet border) with a dual cyan+violet ambient glow + drop shadow. Holds the practiced **Japanese word in cyan `#38f0e6`** at 48px/700 with a cyan text-glow (brightest element), then the reading in **magenta** (glow), then the meaning in `ink-mid`. A top row carries the familiarity chip (left) and the EN→JP mode label (right); category pills line the bottom edge. Fireflies behind it bloom half-bright.
- **Familiarity icon** — a **distinct icon per tier** (NOT a pill). Five levels: New `○` hollow ring (unglowing, `fam-1-new`), Learning `◔` violet, Familiar `◑` cyan, Strong `◕` amber, Mastered `●` magenta — each glowing in its tier hue (`drop-shadow(0 0 8px …)`) except New. **The icon set is a PLACEHOLDER/TBD** (mock uses geometric glyphs); what's locked is the **5 levels, the colour ramp, and colour + icon + text label always together** (colour is never the sole signal). Sizes: 16px drill top-row, 17px library rows, 18px word-detail header.
- **Category pill + overflow toggle** — tiny (8.5px), fully-rounded chips in violet-tinted fill (`rgba(155,107,255,.16)`), **lined along the bottom edge of the word card**. On overflow they collapse behind a brighter **"＋N" toggle** (CSS-only in mock) that expands and swaps its label to "− less". Visually distinct from the familiarity icon.
- **Grade buttons** — three equal-width buttons in a `9px`-gap row over a faint `rgba(255,255,255,.04)` fill, each with a neon edge + glow and a coloured label: **Incorrect** (magenta) · **Close** (amber) · **Correct** (cyan), `rounded/grade` 14px. **No subtext** — single word each. (Order/placement is EXPERIENCE.md's call.)
- **CTA button** — fully-round pill with a **cyan gradient** (`cyan → cyan-bright`), `cyan-on` ink, and a cyan glow (`0 0 32px rgba(56,240,230,.65)`); trailing **✦** spark (e.g. "Let's practice ✦", "Begin ✦"). The FAB is a round cyan button with the same glow.
- **Top-bar avatar / switcher** — 38px circular `QAvatar`, fully round, light ring (`2px rgba(241,240,255,.20)`), filled with a familiarity-ramp hue per user (Dani = violet, Jake = amber; decorative, not semantic). Tapping opens a `field-raise`-solid `QMenu` popover listing **Switch user** + **Settings**. See [`mockups/home.html`](mockups/home.html).
- **Library filter tabs** — a two-level filter nav above the word list. **Level-1 sections** (textbook sources · Custom · Topics) are cyan pills — solid cyan with a cyan glow when active. **Level-2 subsections** (lessons, or shared/private, or topic names) are **violet** pills, and smaller: violet is the tertiary accent, so it reads as subordinate to the cyan parent, and the size step reinforces the hierarchy. Idle pills of both levels share the quiet violet-tint outline. See [`mockups/library.html`](mockups/library.html).
- **Word row** (`.wrow`) — library list item: the Japanese headword (24px) with a small reading beneath, English meaning (`ink-mid`), a familiarity icon at the end, hairline violet divider between rows. The Japanese is **colour-split**: a **kanji** headword glows **cyan** (`#38f0e6`), while **kana** — a kana-only headword or the hiragana reading line — glows **lamp-yellow** (`#ffd24a`). Private words carry a `🔒` amber mark (shared shows none). See [`mockups/library.html`](mockups/library.html).
- **Glass panel** (`.reveal` / `.whead` / `.action` / `.list`) — the generic translucent content surface from Elevation: `rounded/field-panel` 20px, `blur(16px)`, violet border, inset highlight, at z:1 above the firefly layer so fireflies behind it bloom dimmer.
- **Firefly layer** — a few **amber / cyan / magenta** CSS dots at **z:4**, each a solid coloured core with a soft bloom (`box-shadow`), drifting on long looping paths (9–20s) with a scale+opacity bloom pulse — a touch brighter and denser than the forest identity. Renders **behind all content panels**; full over the plain field, dimmer through glass. **`prefers-reduced-motion` → static dim dots** (opacity .4, no travel).

Supporting components in the mocks (inherit Quasar mechanics, brand-tinted): note callout (shared = violet tint / implicit default; private = amber tint + 🔒 lock only — see [`mockups/word-notes.html`](mockups/word-notes.html)), inputs/selects/toggles in `add-word`, primary CTA + FAB in cyan.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Reserve **cyan `#38f0e6` + glow** for the primary accent and, brightest of all, the **practiced Japanese word** | Scatter cyan glow so widely that the practiced word no longer reads as the brightest thing |
| Render the **蛍 mark in lamp-yellow `#ffd24a`** at every size and on every surface | Colour 蛍 cyan, or pair a lamp-yellow glyph with a cyan glow (or vice versa) |
| Use **cyan** primary, **magenta** + **violet** secondary/tertiary as specified | Introduce a colour outside the neon families, or use amber as a solid chrome fill |
| Render the familiarity ramp as **colour + distinct icon + text label** | Rely on colour alone, or reuse the category-pill style for familiarity |
| Colour Japanese by script in lists: **kanji cyan, kana lamp-yellow** | Colour kana cyan, or paint a whole row one colour |
| Keep library **level-1 sections cyan, level-2 subsections violet** (smaller) | Make subsections louder than sections, or reuse cyan for both levels |
| Keep **familiarity icon ≠ category pill** — different shape, placement, purpose | Style familiarity as a pill, or scatter category pills as familiarity signals |
| Keep grade buttons to single words: **Incorrect / Close / Correct** | Add per-grade subtext or a fourth grade |
| Keep fireflies **sparse-ish, slow, behind panels**, multi-colour, with a reduced-motion fallback | Make them dense/fast/strobing, place them above content, or omit the static fallback |
| Let calm be the **manner** — warm, clear, encouraging-toward-practice copy | Over-index on "calm / gentle / serene" filler wording |
| Be **full-bleed, single-column, phone** on the indigo dusk field | Build framed cards-in-a-window, desktop/wide layouts, or flat opaque cards |
| Inherit Quasar for spacing, ripple, inputs, menus, focus | Restate or fight Quasar defaults this file doesn't override |
| Honor the no-pressure stance | Add streaks, leaderboards, due-counts, or re-engagement nudges |

## Appendix — Reverting to the forest-twilight identity

The forest skin and neon skin share token *names* in the implementation (`apps/hotaru/css/hotaru.sass` maps a stable set of `--hotaru-*` variables). Swapping identities is a values-only change in that one file plus the `.hotaru-panel` / `.hotaru-glow` helpers and the `FireflyLayer` colour set — no page markup changes. The forest values live in git commit `c8458eb`; the neon values are current. Explorations for both remain under `.working/direction-*`.

---

*The spines win on conflict with any mock: where a mock and this DESIGN.md (or the decision log / EXPERIENCE.md) disagree, the spine is authoritative — the `mockups/*.html` are illustrative references, not the contract.*
