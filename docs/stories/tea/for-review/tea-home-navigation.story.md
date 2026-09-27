# Story: Tea home navigation screen

## Status
Ready for Review

## Story
**As a** tea drinker opening the Tea app,
**I want** a first screen that lets me choose where to go — Cabinet, Brew or Almanac,
**so that** I am not dropped into the Cabinet when I came to brew or to look something up.

## Acceptance Criteria
1. `/tea` renders a home screen listing the Cabinet, Brew and Almanac sections, in that order, each with a short description.
2. Tapping a section opens it (`tea-cabinet`, `tea-timer`, `tea-almanac`).
3. The Cabinet lives at `/tea/cabinet` (route name unchanged); its back arrow returns to the tea home.
4. New tea and tea detail pages lead back to the Cabinet; Brew and Almanac lead back to the tea home.
5. The Cabinet header keeps its Brew and Almanac shortcuts.
6. Sections are square tiles in the dock's grid (2 columns, 4 from 768px): a large solid-amber icon over a small name — no Chinese name, no description.
7. Icons: Cabinet a tea sprig (stem, top leaf, two side leaves); Teaware a Xi Shi pot with a short, flat-ended spout; Brew that same pot tipped, pouring into a cup; Almanac a leather-bound tome with banded spine, corner pieces, strap clasp and a sprig seal.

## Dev Notes
- Sections are a static list in `TeaHomePage.vue`; a future section (Journal, Teaware) is one entry there plus its route.
- No placeholder tiles for sections that don't exist yet.
- Icons live in `components/SectionIcon.vue` as inline SVG, drawn from reference images agreed in brainstorming; details are cut out in the tile colour (`GROUND.raised`), fill is the oolong liquor.

## Files
- `frontend/src/apps/tea/pages/TeaHomePage.vue` (new) + `TeaHomePage.spec.ts`
- `frontend/src/router/routes.ts`, `frontend/src/router/routes.spec.ts`
- `frontend/src/apps/registry.ts` (comment)
- `frontend/src/apps/tea/components/SectionIcon.vue` (new)
