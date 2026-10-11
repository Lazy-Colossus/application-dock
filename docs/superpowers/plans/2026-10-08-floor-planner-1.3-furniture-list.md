# Floor Planner 1.3 — The Furniture List: Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. Work task by task: run the task's
> tests, then commit. Finish with a Playwright run in the browser (Task 7). Two bugs in 1.2 only
> showed up there.

**Goal:** Furniture mode, where you turn furniture into true-to-scale pieces. There are five
shapes, eleven colours, and a painted custom shape. Pieces can be added one at a time or in bulk
from the strict line format. Editing a piece changes it everywhere; deleting one removes it from
every layout.

**Architecture:**
- **Backend:** add `POST`, `PUT` and `DELETE` endpoints for single pieces. They are not
  rev-checked (refinement 1). The service validates every piece.
- **Frontend helpers:** three pure helpers, each with a spec:
  - `furniture.ts`: the colour and shape vocabulary, size labels and the SVG outlines;
  - `furnitureFormat.ts`: the bulk-add parser;
  - `customShape.ts`: mask painting and trimming.
- **Frontend components:**
  - `FurnitureShape.vue` draws one piece at a given scale. It is used by the list, the form
    preview and the bulk preview, and will be reused by 1.4's tray and canvas.
  - `FurnitureList.vue` is the left panel.
  - `PieceForm.vue` is the right panel, with `CustomShapeEditor.vue` embedded.
  - `BulkAddDialog.vue` is the bulk-add dialog.

**Spec:** FU-1 to FU-5. **Story:** `docs/stories/floor-planner/1.3.furniture-list.story.md`.
**Builds on:** 1.2 (`752e8c8`).

## Global Constraints

These are the same as for 1.1 and 1.2:
- Branch `feat/floor-planner-app`, with the co-author line on every commit.
- Strict layering on the backend.
- All HTTP goes through `useApi`.
- `<script setup lang="ts">`, no `any`, minimal comments.
- Every measurement is shown in `.fp-mono`.
- A dialog's root element is a `<div>`, because Quasar only passes pointer events to direct
  `div` children.
- One spec file per unit, placed next to it.

## Refinements to the spec (decided while planning)

1. **The plan gets its own version number, and piece writes skip the version check.**
   - **Problem:** today every write must match `rev`. That would make Dani adding a sofa refuse
     Jake's unsaved plan drawing with "dani changed this", although she never touched the plan.
     It would also break 1.4's promise that two people arranging different pieces don't refuse
     each other.
   - **New fields:** `ApartmentDoc` gains `plan_rev`, which only plan writes and lock/unlock bump.
     `updated_by` becomes `plan_updated_by`.
   - **Coarse writes:** the plan PUT, lock and unlock go through `_mutate_plan`. It checks
     `base_rev` against `plan_rev` and bumps `plan_rev`, `rev` and `plan_updated_by`.
   - **Per-piece writes:** furniture writes now, and placements in 1.4, go through
     `_mutate_free`. It bumps only `rev` and has no `base_rev`, so it is last-write-wins per piece.
     A piece that has gone returns 404, and the client refetches.
   - **Client:** the store sends `base_rev: apartment.plan_rev`.
   - **Existing data:** documents without the new field load with `plan_rev = 0`. The client
     reads the same value back, so they keep working.
   - Update spec NFR-a to match.
2. **Size bounds.** Basic shapes are 1–1000 cm on each side (up to 10 m). For a round piece the
   form and the parser send `width_cm == depth_cm == diameter`, and the service checks that they
   are equal.
3. **Text limits.** A name is 1–40 characters after trimming; a note is 0–200 characters. Both are
   stored trimmed.
4. **Custom shapes.**
   - `cells` is a list of equal-length strings made of `#` and `.`. It is at most 20 × 20 squares
     (4 × 4 m) and must contain at least one `#`.
   - The service trims empty edge rows and columns and computes `width_cm = cols × 20`,
     `depth_cm = rows × 20`, ignoring any sizes the client sent.
   - Basic shapes are stored with `cells = None`.
5. **List size.** There is a 300-piece cap per apartment, and at most 100 pieces per bulk request.
6. **The line format is strict.**
   - The parser is case-insensitive for shape and colour, and tolerates spaces around `;` and `x`.
   - It also accepts `×` as the size separator.
   - It rejects `custom`, with the reason "custom shapes are painted — add it with Add a piece".
   - It skips blank lines without reporting them.
   - Size is `W x D` in whole cm, except for `round`, which takes a single diameter.
7. **Egg outline.** The egg is drawn in a W × D box. Its widest point is at 42 % of the depth, so
   the wider end is at the top before rotation. The path:

   ```
   M w/2,0 C .82w,0 w,.2d w,.42d C w,.72d .72w,d w/2,d C .28w,d 0,.72d 0,.42d C 0,.2d .18w,0 w/2,0 Z
   ```

8. **Colours.** Use these hex values, which match the mockup's furniture:

   | Colour | Hex |
   |---|---|
   | white | `#f4f3ef` |
   | black | `#2a2a2a` |
   | grey | `#868c94` |
   | beige | `#d9c8a5` |
   | brown | `#6d4a2c` |
   | red | `#b8423a` |
   | orange | `#d9822b` |
   | yellow | `#e0b84a` |
   | green | `#5f8a55` |
   | blue | `#4f74a8` |
   | purple | `#7a5a9a` |

   Every piece gets a 1 px `rgba(0,0,0,.4)` outline, so white pieces stay visible.
9. **Form preview scale.** The preview uses the plan's 100 % scale (0.8 px per cm), shrunk to fit
   the right panel's 228 px if it would be wider. When shrunk, it shows "shown at N %".
10. **Delete confirmation.** Use `window.confirm`, as in Tea. The text is "Delete {name}? It's
    removed from every layout." If the piece is placed nowhere, drop the second sentence.

## File Structure

**Backend (modify):**
- `app/schemas/floor_planner.py`: `plan_rev` and `plan_updated_by`, `PieceDraft`, and the
  furniture request models.
- `app/services/floor_planner_service.py`: `_mutate_plan` and `_mutate_free`, plus
  `add_pieces`, `update_piece` and `delete_piece`.
- `app/routers/floor_planner.py`: the three routes.
- `tests/test_floor_planner_service.py`, `tests/test_floor_planner_router.py`.

**Backend (create):** `tests/test_floor_planner_furniture.py`.

**Frontend (create, under `src/apps/floor-planner/`):**
- `furniture.ts`, `furnitureFormat.ts` and `customShape.ts`, each with a spec.
- `components/FurnitureShape.vue`, `FurnitureList.vue`, `PieceForm.vue`,
  `CustomShapeEditor.vue` and `BulkAddDialog.vue`, each with a spec.

**Frontend (modify):** `types.ts` (`plan_rev`), `stores/useFloorPlanStore.ts` and its spec,
`pages/PlanPage.vue` and its spec.

---

### Task 1: Give the plan its own version number

**Files:** `schemas`, `service`, and the existing 1.1/1.2 backend tests; `types.ts`, the store and
its spec, and the page spec on the frontend.

- [ ] **Schema.** Add `plan_rev: int = 0` to `ApartmentDoc` and `ApartmentView`. Rename
  `updated_by` to `plan_updated_by` in the doc. The view still excludes it.
- [ ] **Service.** Rename `_mutate` to `_mutate_plan`. It checks `doc.plan_rev != base_rev`, then
  bumps `plan_rev` and `rev` and sets `plan_updated_by`. `set_locked` and `replace_plan` use it.
  Add `_mutate_free(username, change)`, which only does `rev += 1`. Rewrite the module
  docstring's rev paragraph to describe the split.
- [ ] **Tests.**
  - Existing tests that assert `rev` after plan writes still pass, because both counters move
    together on plan writes.
  - Add `test_a_piece_write_does_not_stale_the_plan`: `add_pieces` raises `rev` but leaves
    `plan_rev` alone, so a `replace_plan` with the old `plan_rev` succeeds. This test lands with
    Task 2's service functions.
  - Add `test_documents_without_plan_rev_still_load`: write raw JSON without `plan_rev` through
    `repo.write_apartment`'s path, then `set_locked(..., 0, True)` succeeds.
- [ ] **Frontend.**
  - `types.ts`: add `plan_rev: number`.
  - Store `baseRev()`: change it to `apartment.value?.plan_rev ?? 0`.
  - Specs: add `plan_rev` to the fixtures, and make the existing `base_rev` assertions use
    `plan_rev`. Add one store case where `rev` and `plan_rev` differ, to prove `plan_rev` is what
    gets sent.
- [ ] Update spec NFR-a (two sentences describing the split), then commit:
  `refactor(floor-planner): the plan keeps its own rev so piece writes don't collide`.

### Task 2: Backend furniture endpoints

**Files:** `schemas`, `service`, `router`, `tests/test_floor_planner_furniture.py` and the router
test.

- [ ] **Schema:**

```python
NAME_MAX = 40
NOTE_MAX = 200
SIDE_CM_MAX = 1000
CUSTOM_MAX = 20
PIECES_MAX = 300
BULK_MAX = 100


class PieceDraft(BaseModel):
    name: str
    colour: Colour
    note: str = ""
    shape: Shape
    width_cm: int = 0
    depth_cm: int = 0
    cells: list[str] | None = None


class AddPiecesRequest(BaseModel):
    pieces: list[PieceDraft] = Field(min_length=1, max_length=BULK_MAX)
```

- [ ] **Service.**
  - `_clean_piece(draft) -> Furniture` applies refinements 2–4 and raises a `ValueError` naming
    the piece, for example `"Sofa: width must be 1–1000 cm"`. Custom pieces have their mask
    trimmed and their size computed. New ids are `f_<uuid hex>`.
  - `add_pieces(username, drafts)` cleans every piece first, so one bad piece refuses the whole
    request. It refuses the request if it would exceed `PIECES_MAX`, then appends.
  - `update_piece(username, id, draft)` replaces the piece but keeps its id. It raises
    `FileNotFoundError` if the id is unknown.
  - `delete_piece(username, id)` removes the piece and filters it out of every layout's
    `placements`. It raises `FileNotFoundError` if the id is unknown.
  - All three go through `_mutate_free`. Furniture can be edited whether the plan is locked or
    not.
- [ ] **Router.**

  | Method and path | Body | Calls |
  |---|---|---|
  | `POST /apartment/furniture` | `AddPiecesRequest` | `add_pieces` |
  | `PUT /apartment/furniture/{piece_id}` | `PieceDraft` | `update_piece` |
  | `DELETE /apartment/furniture/{piece_id}` | none | `delete_piece` |

- [ ] **Tests** (`test_floor_planner_furniture.py`):
  - Adding three pieces returns them in order with `f_` ids, trimmed names, and `cells is None`
    for basic shapes.
  - Adding pieces does not change `plan_rev` (Task 1's test).
  - A custom L shape `["#..", "#..", "###", "..."]` is stored trimmed as `["#..", "#..", "###"]`
    at 60 × 60 cm. The width and depth the client sent are ignored.
  - Refusals, parametrised: a blank name; a 41-character name; a 201-character note; width 0;
    width 1001; round with width ≠ depth; custom with no `#`; custom with ragged rows; custom
    21 squares wide; a character other than `#` or `.`.
  - One bad piece in a bulk add refuses the whole request, and nothing is stored.
  - The 300-piece cap is enforced. Set it up by writing 300 pieces directly through
    `apartment_transaction`.
  - Updating keeps the id. Updating an unknown id raises `FileNotFoundError`.
  - Delete cascades: put a placement for the piece in two layouts directly on the document,
    delete the piece, and both placement lists are empty. The other piece's placements survive.
  - Router: POST 200; POST with 101 pieces → 422; PUT on an unknown id → 404; DELETE 200.
- [ ] Commit: `feat(floor-planner): add, edit and delete furniture pieces`.

### Task 3: Frontend vocabulary, line parser, custom-shape helpers

**Files:** `furniture.ts`, `furnitureFormat.ts`, `customShape.ts` and their specs.

- [ ] **`furniture.ts`:**
  - `COLOURS: { id: Colour; name: string; hex: string }[]`, in FU-2 order with the hex values
    from refinement 8.
  - `SHAPES: { id: Shape; label: string }[]`.
  - `interface PieceDraft`, which mirrors the backend model.
  - `colourHex(c)`.
  - `sizeLabel(p)`: "220 × 95 cm", or "⌀ 110 cm" for round.
  - `outline(p, scale): string`, an SVG path for one piece drawn inside a box of
    `w = width_cm × scale` by `d = depth_cm × scale`:
    - rectangle: a rect path;
    - round and oval: an ellipse drawn as two arcs;
    - egg: refinement 7's path;
    - custom: one rect subpath per `#` cell, each `20 × scale` square.
- [ ] **`furnitureFormat.ts`:**

```ts
export type ParsedLine =
  | { line: number; text: string; ok: true; piece: PieceDraft }
  | { line: number; text: string; ok: false; reason: string };
export function parseFurnitureList(text: string): ParsedLine[];
```

  Possible reasons, each a short lowercase phrase:
  - "needs name; shape; size; colour"
  - "unknown shape 'square' — use rectangle, round, oval or egg"
  - "custom shapes are painted — add it with Add a piece"
  - "size should be W x D in cm, e.g. 220 x 95"
  - "a round piece takes one size, its diameter, e.g. 110"
  - "sizes must be 1–1000 cm"
  - "unknown colour 'teal'"
  - "name is longer than 40 characters"
  - "too many parts — a note can't contain ';'"

  Spec cases: a good line of each basic shape; mixed case (`SOFA; Rectangle; 220X95; GREY`); `×`
  and spaces; a note; blank lines skipped while line numbers still count from the real line;
  every failure reason above; and a trailing `;` with no note being allowed.
- [ ] **`customShape.ts`:**
  - `emptyMask(n)`.
  - `toggle(mask, cell, on)`.
  - `trim(mask)`: drops empty edge rows and columns, and returns `[]` if nothing is painted.
  - `maskSize(mask)`: `{ cols, rows, widthCm, depthCm }`.
  - `pad(mask, n)`: centres a stored mask in the n × n editor grid for editing.

  Specs cover trimming an L, an empty mask, round-tripping through `pad` and `trim`, and the size
  maths.
- [ ] Commit: `feat(floor-planner): furniture vocabulary, list parser and custom-shape helpers`.

### Task 4: Store actions

**Files:** `stores/useFloorPlanStore.ts` and its spec.

- [ ] **Actions.** All of these use the existing `write()`, so a 404 sets `error` and refetches:
  - `addPieces(drafts)` posts `{ pieces }`.
  - `updatePiece(id, draft)` uses PUT.
  - `deletePiece(id)` uses DELETE.
  - `placedIn(id)` is a getter returning the number of layouts that place the piece, for the
    delete confirmation.
- [ ] **Specs:**
  - The bulk add posts every piece in one call.
  - A 404 on update sets `error` and refetches.
  - Delete calls the right path.
  - A piece write while a plan draft is open leaves the draft and `dirty` untouched. The draft is
    separate state; pin it anyway.
- [ ] Commit: `feat(floor-planner): store actions for furniture`.

### Task 5: Components

**Files:** the five components and their specs.

- [ ] **`FurnitureShape.vue`.**
  - Props: `piece`, `scale` (px per cm), and optional `maxPx`, which shrinks the drawing to fit a
    box.
  - It renders an `<svg>` sized to the piece, with one `<path :d="outline(...)">` filled in the
    piece's colour and outlined at 1 px `rgba(0,0,0,.4)`.
  - Spec: the path's `d` starts with the expected command for each shape, `maxPx` limits the svg
    width, and the fill is the colour's hex.
- [ ] **`FurnitureList.vue`** (left panel).
  - Props: `pieces`, `selectedId`, `disabled`.
  - It shows a count heading ("Furniture · 7"). Each row is a button with a 48 × 40 thumbnail
    (`FurnitureShape` with `maxPx`), the name, and `sizeLabel` in mono. The selected row gets B's
    blue-tint card.
  - Below the rows are **Add a piece** (primary) and **Bulk add from list** buttons.
  - The empty state reads "Nothing yet. Add pieces one by one, or paste a list."
  - Emits `select`, `add` and `bulk`.
- [ ] **`CustomShapeEditor.vue`.**
  - Props: `modelValue` (the trimmed mask). Emits `update:modelValue` with the trimmed mask after
    each stroke.
  - It shows a 20 × 20 grid of 14 px squares. Pressing on an empty square paints and pressing on
    a painted one clears, and dragging continues in the same mode. It uses pointer capture, as in
    `PlanCanvas`.
  - It shows a live readout: "1.80 × 0.80 m · 180 × 80 cm".
  - Spec: dragging across 3 squares emits a 1 × 3 mask; pressing on a painted square clears it;
    the readout is correct.
- [ ] **`PieceForm.vue`** (right panel).
  - Props: `piece` (a `Furniture` when editing, `null` when adding) and `placedIn`.
  - Fields:
    - name, with `maxlength=40`;
    - a shape segmented control with five options;
    - for basic shapes, Width and Depth in cm. Round shows a single Diameter field;
    - for custom, the `CustomShapeEditor`;
    - 11 colour chips, each with `aria-label` set to the colour name;
    - a note in a textarea, with `maxlength=200`.
  - It shows a live preview: `FurnitureShape` at 0.8 px per cm, fitted into 228 px, with
    "shown at N %" when it has been shrunk, and the size in mono.
  - Actions: **Save** (disabled until the draft is valid, using the same rules as the backend),
    **Cancel**, and **Delete** when editing, which asks for refinement 10's confirmation.
  - Emits `save: [draft]`, `remove` and `cancel`.
  - Spec cases:
    - Adding a rectangle emits the draft with whole-cm sizes.
    - Switching to Round shows Diameter and emits width equal to depth.
    - Save is disabled for width 0 or a blank name.
    - Editing pre-fills the form.
    - Delete confirms with the "every layout" wording only when `placedIn > 0`. Stub
      `window.confirm`.
    - Custom emits the mask, and the size comes from the mask.
- [ ] **`BulkAddDialog.vue`.**
  - The root is a `div`. It contains a format help line, a monospaced textarea with a
    three-example placeholder, and a live preview table built from `parseFurnitureList`: line
    number, a ✓ or ✗ icon with text (never colour alone), and either name · shape · size ·
    colour swatch or the reason.
  - The button reads **Add N pieces** and is disabled when N is 0. A line reads "M lines will be
    skipped" when there are failures.
  - Emits `add: [drafts]` and `cancel`.
  - Spec: a mix of good and bad lines shows both in the table, and Add emits only the good drafts.
- [ ] Commit: `feat(floor-planner): furniture list, piece form, custom shape editor, bulk add`.

### Task 6: Furniture mode in PlanPage

**Files:** `pages/PlanPage.vue` and its spec.

- [ ] **Furniture mode layout.**
  - The left panel shows `FurnitureList`.
  - The centre shows the canvas, read-only, as already built.
  - The right panel shows `PieceForm`:
    - while adding or when a piece is selected, keyed by the selection so the form resets;
    - otherwise, a hint: "Select a piece to edit it, or add one."
  - Local state: `selectedId: string | null` and `adding: boolean`.
  - After a successful add, the new piece is selected: the last id in the returned list. After a
    delete, the selection clears.
- [ ] **Bulk add.** `BulkAddDialog` opens in a `q-dialog`. On `add`, call `store.addPieces`, then
  close the dialog if that succeeded.
- [ ] **Page spec:**
  - Furniture mode shows the list and the hint.
  - Add a piece, fill in the form and Save posts `{ pieces: [draft] }` and selects the new piece.
  - Selecting a piece and changing its colour sends a PUT.
  - Delete with confirm sends a DELETE and clears the selection.
  - Bulk add with two good lines and one bad posts two pieces.
- [ ] Run `npm test`, `npm run lint`, `npx vue-tsc --noEmit` and `npm run build`, then commit:
  `feat(floor-planner): furniture mode (Story 1.3)`.

### Task 7: Browser check and hand off

- [ ] Extend `scratchpad/pw/drive.mjs` (or write a `furniture.mjs` beside it) against the running
  dev servers, at 1440 × 900:
  1. Switch to Furniture. Screenshot the empty state.
  2. Bulk add these lines. Screenshot the preview table, then press Add:

     ```
     Sofa; rectangle; 220 x 95; grey; IKEA Kivik
     Coffee table; round; 80; brown
     Dining table; oval; 160 x 90; beige
     Egg chair; egg; 85 x 90; green
     Wardrobe; square; 200 x 60; brown
     ```

     The fifth line should be refused because of `square`.
  3. Add a piece → Custom → paint an L → name it "Corner sofa" → Save. Screenshot the form with
     its preview.
  4. Select Sofa → change it to blue → Save.
  5. Delete Coffee table and confirm. Screenshot the list.
  6. Check the console for errors.
- [ ] Look at every screenshot. In particular, check the egg's orientation (wider end at the top)
  and that the white piece is visible on white.
- [ ] Fill in the Dev Agent Record, move the story to `for-review/`, and commit:
  `docs(floor-planner): story 1.3 ready for review`.

## Review Focus

1. **The plan's version is separate from the document's.** Piece writes never make a plan save
   go stale, and plan writes still catch real plan conflicts. Pinned in Tasks 1 and 2.
2. **Delete cascades.** No placement is left pointing at a deleted piece in any layout. Pinned in
   Task 2.
3. **The server never trusts piece sizes.** Custom sizes are always derived from the trimmed
   mask, and round pieces must have width equal to depth. Pinned in Task 2.
4. **A bulk add is all-or-nothing on the server.** The client sends only the lines that parsed,
   so a server refusal means the parser and the server rules have drifted apart. The form's
   validity check and `_clean_piece` share the same limits, kept as constants on both sides.
5. **Every dialog root is a `div`.** That is the 1.2 lesson; Task 7 checks it in a real browser.
