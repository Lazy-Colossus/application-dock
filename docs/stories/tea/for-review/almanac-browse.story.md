# Story: Browse the almanac like a book

## Status
Ready for Review

## Story
**As a** tea drinker leafing through the Almanac,
**I want** it laid out in chapters I can wander — by class or by place — with a way to open a page at random,
**so that** exploring 173 entries feels like reading a tea book, not scrolling a flat list.

## Acceptance Criteria
1. The Almanac opens in the **Class** view: one chapter per class present, in the Chinese classification's order (green, yellow, white, oolong, red, dark, other). Each chapter heading is in that class's `head` colour with its Chinese name and entry count. Inside it, entries are grouped under country subheadings.
2. A **Class | Place** toggle switches to the **Place** view: one chapter per country, with class subheadings (liquor dot + class name in its `head` colour) in classification order.
3. Countries are ordered by entry count, busiest first (China, Japan, Taiwan…), ties A–Z. This applies both to the Place chapters and to the country subheadings inside a class. Entries within a group are sorted A–Z by name.
4. A sticky **chapter rail** sits under the header. In the Class view its chips are the first character of each class's Chinese name (綠 黃 白 烏 紅 黑 其) in liquor colours, and each chip's accessible name is the full class name. In the Place view the chips are country names.
5. Tapping a chip scrolls that chapter to just under the rail. The active chip follows scrolling and is the last chapter whose top has reached the rail. The rail scrolls itself horizontally to keep the active chip in sight. Every chapter, the last included, can reach the rail.
6. **⁂ At random** opens the detail page of a random entry from those currently shown, so it respects the search. It is disabled when nothing is shown.
7. The view you last chose is kept for the session, so coming back from an entry reopens the same view.
8. Search stays. It refetches with `?q=`, results stay grouped in the active view, and chapters with no match disappear. The country dropdown is removed, because the Place view replaces it.
9. Rows show name, native script and the summary clipped to two lines. Tapping a row opens the entry, as before.

## Dev Notes
- The grouping and choice rules are pure functions in `almanac.ts`: `groupAlmanac(entries, nodes, view)`, `chapterAt(tops, line)` and `pickRandom`. A class comes from the catalogue via `rootClassOf`, so the page now also loads the catalogue store.
- The catalogue's middle tier is effectively per country ("Oolong > Taiwanese"), and `default_origin` is free text, so there is no reliable region level. The two views are mirror images: class inside country, and country inside class.
- `useSectionInView` takes an optional `pick` rule. The Cabinet keeps the default nearest-centre rule. The Almanac passes `chapterAt`, because a chapter can run to thousands of pixels and the centre rule would hand the rail to a short neighbour.
- The rail uses `scrollTo` on itself, not `scrollIntoView`. `scrollIntoView` also scrolls the page and cancels the smooth scroll of a chip jump that is still running.
- There are no backend changes.
- Out of scope: restoring the scroll position when coming back from an entry, and previous/next paging on the entry page.

## Files
- `frontend/src/apps/tea/almanac.ts` (new) + `almanac.spec.ts`
- `frontend/src/apps/tea/components/AlmanacRail.vue` (new) + `AlmanacRail.spec.ts`
- `frontend/src/apps/tea/pages/AlmanacPage.vue` + `AlmanacPage.spec.ts`
- `frontend/src/apps/tea/stores/useTeaAlmanacStore.ts` + spec (`view`)
- `frontend/src/apps/tea/composables/useSectionInView.ts` + spec (`pick`)
