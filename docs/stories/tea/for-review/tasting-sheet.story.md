# Story: Tasting sheet

## Status
Ready for Review

## Story
**As a** tea drinker at the table,
**I want** to fill in my tasting notebook's sheet for a sitting — aroma at each stage, body, mouthfeel, hui gan, sheng jin, body feeling, plus leaf, liquor and cup aroma — in English,
**so that** each sitting's tasting is kept in a form I can read at a glance, and a tea's page tells me what it's usually like.

## Acceptance Criteria
1. Every session can carry one tasting (never per infusion). Every field is optional; ★ fields are 1–5.
2. The Cha Xi page shows the tasting under the table's fields as four collapsible sections — Leaf, Liquor, Aroma & Qi (香&气), Sensation (感&觉) — with English labels and the notebook's Chinese beside them. A fresh sheet starts closed; a section holding values opens and says how many it holds.
3. Tasting edits sync like the cha xi (≈1.5 s after the last change, and on leaving). The Journal form carries the same sections, and editing a sitting keeps its tasting.
4. Aroma structure and body feeling take several picks, kept in the notebook's order; body, saturation and liquor colour take one; tapping a picked value or the current ★ again clears it. "None noticeable" never sits beside another body feeling.
5. Clearing every field leaves the sitting with no tasting.
6. The Journal entry shows the filled fields only, section by section; the Journal card shows a line such as "orchid · mellow · hui gan ★★★★"; a tasted sitting counts for "Cha xi only".
7. A tea's page shows a Tasting summary once any sitting is tasted: the count, the average of every rated ★ field, the usual body and saturation, the most-picked structure words, and aroma words that recur in two or more sittings.

## Dev Notes
- Spec: `docs/superpowers/specs/2026-09-29-tea-tasting-design.md`; plan: `docs/superpowers/plans/2026-09-29-tea-tasting.md`.
- `tasting` on `TeaSession` (tea doc schema v6); the sheet is described once in `tasting.ts` (`TASTING_SECTIONS`) and rendered by `TastingFields`.
- Out of scope: the flavour wheel and custom fields (FR-15, FR-16), comparing two sittings side by side, per-infusion tasting, a taste section.
