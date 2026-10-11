# Floor Planner 1.5: Several Apartments and Autosave (Implementation Plan)

**Goal:** A user keeps several apartments and switches between them; drawing saves itself.

**Spec:** AP-1 to AP-6, FP-9, SH-1 (revised). **Story:**
`docs/stories/floor-planner/1.5.several-apartments-and-autosave.story.md`. **Builds on:** 1.4.

## Global Constraints

Same as 1.1–1.4: strict layering, all HTTP through `useApi`, `<script setup lang="ts">`, no
`any`, minimal comments, one spec file next to each unit.

## Decisions

1. **Membership shape.** `memberships.json` is `{ username: [apartment_id, ...] }`. The repo
   reads the legacy `{ username: apartment_id }` as a one-item list. Lock order is unchanged:
   membership, then apartment.
2. **Access.** Every service call takes `apartment_id` and checks membership first. A non-member
   gets `FileNotFoundError` (404), the same as a missing apartment.
3. **First visit.** `GET /apartments` creates "My apartment" when the user has none, so the list
   is never empty. This replaces FP-1's lazy creation and the unsaved `id: null` view.
4. **Leaving and deleting** return the caller's remaining apartment list (topped up by rule 3),
   so the client knows where to go next. Removing someone else returns the apartment view.
5. **Adding a member** no longer deletes the added user's own apartment; the SH-1 refusals about
   other members and non-empty apartments go away, replaced by the 20-apartment limit.
6. **Duplicate** deep-copies the doc with a new id; furniture and layout ids stay as they are,
   since they are scoped to their apartment.
7. **Autosave** lives in the store. The draft history is kept across saves; the store remembers
   the snapshot it last saved and the `plan_rev` that save produced. `dirty` means the present
   snapshot differs from the saved one. If `plan_rev` moves on while nothing is dirty (another
   member saved, or lock/unlock), the history is dropped so stale undo steps can't overwrite
   theirs. A conflict pauses autosave until Save again or Discard.
8. **Routing.** `floor-planner/:apartmentId?`. Without an id the page replaces the URL with the
   first apartment in the list. `onBeforeRouteUpdate` and `onBeforeRouteLeave` flush autosave
   first and only ask to leave if the save fails.

## Tasks

- [ ] **Backend.** Schemas (`name`, `updated_at`, `ApartmentSummary`, name requests), repo
  (list memberships + legacy read), service (id-scoped calls, create, duplicate, rename,
  delete, leave, limit), router (`/apartments...`). Update the existing floor-planner tests for
  the new routes; add `tests/test_floor_planner_apartments.py`.
- [ ] **Store.** `apartments`, `currentId`, `fetchApartments`, `open`, create / duplicate /
  rename / delete / leave, id-scoped paths, autosave. Spec covers each.
- [ ] **UI.** `ApartmentMenu` in the top bar; `NameDialog` reused for new / duplicate / rename;
  `MembersDialog` leave copy; status bar Saving… / Saved / Unsaved; route param.
- [ ] **Docs.** Spec sections, story record, move to `for-review/`.
- [ ] **Browser check.** Two apartments, switch, reload, duplicate, delete, autosave after a
  stroke, undo after autosave.
