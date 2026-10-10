# Floor Planner 1.4: Arrange Furniture in Layouts (Implementation Plan)

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. Work task by task: run the task's
> tests, then commit. Finish with the Playwright check in the browser (Task 8).

**Goal:** Arrange mode. On the locked plan you drag pieces from a tray onto the plan, move them in
10 cm steps, rotate them in 90° steps, and see warnings when a piece overlaps a wall, falls outside
the apartment, or overlaps another piece. You keep several named layouts as tabs and compare them.

**Architecture:**
- **Backend.** New layout and placement endpoints, all of them per-piece, last-write-wins writes
  through `_mutate_free` (from 1.3). Placing or moving a piece needs a locked plan. Placements
  that end up off the plan are dropped when the plan is resized.
- **Frontend, pure logic.** `geometry.ts` holds the rules: rotated bounds, snapping, the
  centre-inside check, and warnings.
- **Frontend, canvas.** `PlanCanvas` gains a furniture layer. Pieces are drawn in plan
  centimetres, moved with the pointer, and dropped onto the plan from the tray with HTML5
  drag-and-drop.
- **Frontend, panels and store.**
  - The left panel is `LayoutTray`.
  - The right panel is `PlacementInspector`.
  - Layout tabs sit in the bottom bar, in a slot in `StatusBar`.
  - The store updates placements optimistically, so a dropped piece doesn't jump back while the
    request is in flight.

**Spec:** LA-1 to LA-5, FP-8 and NFR-a. **Story:** `docs/stories/floor-planner/1.4.arrange-layouts.story.md`.
**Mockup:** the "B · Drafting table — arranging Layout A" artboard. **Builds on:** 1.3 (`1699e35`).

## Global Constraints

These are the same as for 1.1–1.3:
- Work on the branch `feat/floor-planner-app`, with the co-author line on every commit.
- Strict layering.
- All HTTP goes through `useApi`.
- Use `<script setup lang="ts">`, never `any`, and keep comments minimal.
- Measurements are shown in `.fp-mono`.
- Dialog roots are `div`s.
- Each unit has one spec file, next to it.

## Refinements to the spec (decided while planning)

1. **Where a piece is stored and how it rotates.**
   - Each placement stores `x_cm`/`y_cm`, the top-left corner *before* rotation, plus `rotation`.
   - The centre is `(x + w/2, y + d/2)`. At 90° or 270° the rotated bounds swap `w` and `d`
     around that same centre.
   - Rotating changes only `rotation`, so the centre never moves (LA-4).
   - Dragging snaps `x_cm`/`y_cm` to 10 cm.
2. **A piece's centre must stay on the plan.** The server refuses a placement whose centre lies
   outside `0..cols×20` × `0..rows×20` ("Keep the piece on the plan"). Anything short of that is
   allowed, and only warned about. When the plan is resized (1.2's `replace_plan`), placements
   whose centre falls outside the new size are removed from every layout, so no piece is left
   stranded off-canvas.
3. **The warnings** (LA-5) are all based on the rotated bounding box, not the exact outline:
   - **Overlaps a wall**: any `wl` square the box touches.
   - **Outside the apartment**: any square under the box whose surface *and* feature are both
     empty (`..`).
   - **Overlaps {name}**: the box overlaps another placed piece's box by more than 1 cm on each
     axis, so pieces that only touch don't warn.
4. **Layouts.**
   - Names are 1–40 characters after trimming, and an apartment can have at most 20 layouts.
   - **+ New layout** proposes the next free name ("Layout B", "Layout C"…). It starts empty.
   - **Duplicate** copies the placements under the name "{name} copy", cut to 40 characters.
   - Rename and delete work on the active tab.
   - You cannot delete the last layout ("Keep at least one layout").
   - Deleting asks first ("Delete Layout B? Its arrangement is lost; the furniture stays.").
   - Creating or duplicating a layout switches to it.
5. **Placing a piece twice in one layout moves it.** `PUT …/placements/{furniture_id}` is an
   upsert, so a layout can never hold two placements of the same piece (LA-2).
6. **Arranging needs a locked plan, on the server too.**
   - The server refuses placement writes (place, move, rotate, back to tray) while the plan is
     unlocked ("Lock the plan to arrange furniture").
   - Layout create, rename, duplicate and delete are allowed either way, because they don't touch
     geometry.
   - Arrange mode on an unlocked plan shows the placed pieces read-only. The left panel shows "Lock
     the plan to arrange furniture." with a **Lock plan** button that calls `lockWithSave`.
7. **The tray uses HTML5 drag-and-drop; the canvas uses pointer events.**
   - Tray cards are `draggable` and carry the `application/x-fp-piece` data type. The canvas
     accepts the drop and centres the piece under the cursor, snapped.
   - Moving pieces already on the canvas uses pointer events with capture, as for drawing.
   - **Back to tray** is a button in the inspector. Dragging a piece back onto the tray is out of
     scope: it would need two separate drag systems to cooperate, for little gain.
8. **Keyboard.**
   - **R** rotates the selected piece right and **Shift+R** rotates it left.
   - **Escape** deselects.
   - These keys work only in Arrange mode on a locked plan, and never while typing in an input.
9. **Optimistic updates.** `placePiece` and `removePlacement` change `apartment` locally first,
   then write. On failure the existing `write()` refetches, so the view snaps back to the truth.
10. **The name dialog is shared.** `LabelDialog` is generalised into `NameDialog`, with props
    `title`, `initial`, `placeholder` and `canDelete`. It is reused for room labels and for layout
    names.
11. **What each mode shows.** Furniture appears on the canvas only in Arrange mode, and only from
    the active layout. Draw plan and Furniture modes show the bare plan.

## File Structure

**Backend.**
- Modify:
  - `app/schemas/floor_planner.py`: `LAYOUT_NAME_MAX`, `LAYOUTS_MAX`, `LayoutNameRequest`,
    `PlacementRequest`.
  - `app/services/floor_planner_service.py`: the layout and placement functions, plus pruning in
    `replace_plan`.
  - `app/routers/floor_planner.py`.
- Create: `tests/test_floor_planner_layouts.py`.
- Modify tests: `tests/test_floor_planner_plan.py` (pruning) and `tests/test_floor_planner_router.py`.

**Frontend, under `src/apps/floor-planner/`.**
- Create, each with a spec: `geometry.ts`, `components/LayoutTray.vue`,
  `components/PlacementInspector.vue`, `components/LayoutTabs.vue`.
- Rename: `components/LabelDialog.vue` becomes `components/NameDialog.vue`, with its spec.
- Modify:
  - `grid.ts`, adding `cmAt`.
  - `components/PlanCanvas.vue` and `components/StatusBar.vue`, each with its spec.
  - `stores/useFloorPlanStore.ts` and `pages/PlanPage.vue`, each with its spec.

---

### Task 1: Backend layouts and placements

**Files:** `schemas`, `service`, `router`, and the tests.

- [ ] **Schema.** Add:

```python
LAYOUT_NAME_MAX = 40
LAYOUTS_MAX = 20


class LayoutNameRequest(BaseModel):
    name: str


class PlacementRequest(BaseModel):
    x_cm: int
    y_cm: int
    rotation: Rotation = 0
```

- [ ] **Service.** Every function below goes through `_mutate_free`, and each is a short function.
  - `create_layout(user, name)` cleans the name, refuses a 21st layout, and appends
    `Layout(id=f"l_{hex}", name=...)`.
  - `rename_layout(user, layout_id, name)` renames a layout.
  - `duplicate_layout(user, layout_id)` copies the placements under the name `"{name} copy"[:40]`.
    It checks the cap.
  - `delete_layout(user, layout_id)` deletes a layout, refusing the last one.
  - `place_piece(user, layout_id, furniture_id, req)` checks, in order:
    1. the plan is locked;
    2. the layout exists (otherwise 404);
    3. the piece exists (otherwise 404);
    4. the piece's centre is on the plan.

    It then upserts the placement.
  - `remove_placement(user, layout_id, furniture_id)` requires a locked plan and removes the
    placement. If the piece isn't placed in that layout, it does nothing and returns the view, so
    a double click is harmless.
  - `_layout(doc, id)` and `_piece(doc, id)` are lookup helpers that raise `FileNotFoundError`
    with "That layout is gone…" or "That piece is gone…".
  - `_centre_inside(doc, piece, x, y)` returns
    `0 <= x + w/2 <= cols*20 and 0 <= y + d/2 <= rows*20`, using the unrotated size. The centre
    doesn't move under rotation.
  - `replace_plan`: after assigning the new size, filter every layout's placements with
    `_centre_inside`. Pieces whose furniture is missing are already gone, through 1.3's cascade.
- [ ] **Router.** Add these routes, each returning `ApartmentView`:

  | Method and path | Body |
  |---|---|
  | `POST /apartment/layouts` | `LayoutNameRequest` |
  | `PUT /apartment/layouts/{layout_id}` | `LayoutNameRequest` |
  | `POST /apartment/layouts/{layout_id}/duplicate` | — |
  | `DELETE /apartment/layouts/{layout_id}` | — |
  | `PUT /apartment/layouts/{layout_id}/placements/{furniture_id}` | `PlacementRequest` |
  | `DELETE /apartment/layouts/{layout_id}/placements/{furniture_id}` | — |

- [ ] **Tests** (`test_floor_planner_layouts.py`). The fixture locks the plan and adds a sofa
  (220 × 95) and a chair.
  - Placing a piece on an unlocked plan raises `ValueError` containing "Lock the plan".
  - Placing then moving the same piece leaves one placement, at the new spot. This is the "placing
    it twice" case.
  - Rotation is stored, and an invalid rotation (45) is refused by the schema.
  - Refused positions: a centre just past the right edge, and a negative centre. A position with
    the centre exactly on the edge is allowed.
  - An unknown layout or piece raises `FileNotFoundError`.
  - Removing a placement, and removing one twice, both succeed.
  - `create_layout` trims the name and refuses a blank one, a name longer than 40 characters, or
    a 21st layout.
  - Rename works.
  - Duplicating copies the placements under the name "Layout A copy". Moving a piece in the copy
    leaves the original alone.
  - Deleting the last layout raises a `ValueError` containing "at least one".
  - Placement writes don't change `plan_rev`.
  - `test_floor_planner_plan.py`: shrinking the plan drops placements whose centre now falls
    outside, and keeps the others.
  - Router: the new routes return 200 or 404/422 as appropriate.
- [ ] Commit: `feat(floor-planner): layouts and placements on the server`.

### Task 2: Geometry

**Files:** `geometry.ts` and its spec; `grid.ts` (`cmAt`) and its spec.

- [ ] Add `cmAt(clientX, clientY, rect, zoom): { x: number; y: number }` to `grid.ts`. It is the
  unclamped plan position in cm, the counterpart of `cellAt`.
- [ ] Create `geometry.ts`:

```ts
export interface Box { x: number; y: number; w: number; h: number }
export const SNAP_CM = 10;
export const snap = (v: number) => Math.round(v / SNAP_CM) * SNAP_CM;
export function bounds(piece, placement): Box;          // rotated, about the centre
export function centreInside(piece, x, y, plan): boolean;
/** Top-left (unrotated) that puts the piece's centre at a point, snapped. */
export function topLeftForCentre(piece, cx, cy): { x: number; y: number };
export type Warning =
  | { kind: "wall" }
  | { kind: "outside" }
  | { kind: "overlap"; name: string };
export function warnings(piece, placement, plan, others: { piece; placement }[]): Warning[];
export function warningText(w: Warning): string;   // "Overlaps a wall", "Outside the apartment", "Overlaps Bed"
```

  `warnings` finds the squares a box touches with
  `floor(x / 20)` … `ceil((x + w) / 20) - 1` on each axis, clamped to the grid. A box that
  extends past the grid counts as outside.
- [ ] Spec cases:
  - The bounds of a 220 × 95 piece at 0°, 90° (same centre, sides swapped) and 180°.
  - `snap` rounding, for example 14 → 10, 15 → 20, −6 → −10.
  - `topLeftForCentre` round-trips through `bounds`.
  - `centreInside` at the edges.
  - A wall under the box warns; a wall only touching the box's edge doesn't.
  - A piece over an unpainted square warns "outside"; the same piece over a painted floor
    doesn't.
  - Two pieces overlapping by 20 cm warn, naming the other piece; two that only touch at an edge
    don't.
  - All three warnings can appear together.
- [ ] Commit: `feat(floor-planner): placement geometry and warnings`.

### Task 3: Store actions

**Files:** `stores/useFloorPlanStore.ts` and its spec.

- [ ] **Layout actions:**
  - `createLayout(name)`, `renameLayout(id, name)`, `duplicateLayout(id)` and `deleteLayout(id)`.
  - Each uses `write()` and returns whether it succeeded.
  - The page reads the new id from the returned list: the last layout after a create or a
    duplicate.
- [ ] **Placement actions, applied locally first (refinement 9):**
  - `placePiece(layoutId, furnitureId, p: { x_cm; y_cm; rotation })` upserts the placement into
    `apartment.layouts[…].placements`, then PUTs.
  - `removePlacement(layoutId, furnitureId)` removes it locally, then DELETEs.
- [ ] **Getter:** `nextLayoutName()` returns the first of "Layout A".."Layout Z" that isn't
  already taken, falling back to "Layout {n}".
- [ ] **Specs:**
  - Placing updates `apartment` before the request resolves: check with a pending promise.
  - A failed placement refetches the server state.
  - Removing a placement is optimistic in the same way.
  - `nextLayoutName` skips names already taken.
  - Each layout action calls the right path.
- [ ] Commit: `feat(floor-planner): store actions for layouts and placements`.

### Task 4: Furniture layer on the canvas

**Files:** `components/PlanCanvas.vue` and its spec.

- [ ] **New props:**
  - `placed: { piece: Furniture; placement: Placement; warned: boolean }[]` (default `[]`).
  - `selectedId: string | null`.
  - `arranging: boolean`: pieces can be moved.
  - `droppable: boolean`: accepts tray drops.

  **New emits:** `select: [id | null]`, `move: [id, x, y]` and `drop: [id, x, y]`.
- [ ] **Rendering** happens after labels and before the stroke preview. Each piece is drawn as:

  ```
  <g transform="translate(cx cy) rotate(r) translate(-w/2 -d/2)">
  ```

  - Inside it is the piece's `outline(piece, 1)`. The canvas works in cm units, so the scale is 1.
    It uses `customEdges` for custom shapes, as `FurnitureShape` does.
  - After the group come the overlays, not rotated:
    - The name is centred on the piece in the label font (`LABEL_PX × cmPerPx`, with a white
      halo), so it stays upright.
    - The selected piece gets a 2 px `#1d4ed8` rectangle around its rotated bounds.
    - A warned piece gets a 2 px dashed `#c2410c` rectangle 3 px outside its bounds, using
      non-scaling strokes.
- [ ] **Moving.**
  - Pointerdown on a piece while `arranging` selects it and starts a drag. It records the offset
    from the piece's top-left, uses pointer capture, and stops propagation, so a piece click
    never starts a drawing stroke.
  - Pointermove updates a local `dragPos`, the snapped top-left, and renders the dragged piece
    there.
  - Pointerup emits `move` only if the position changed, and otherwise just `select`.
  - Pointerdown on empty plan in arrange mode emits `select(null)`.
- [ ] **Dropping.** On `dragover`, if `droppable` and the data types include the piece type,
  call `preventDefault`. On `drop`, read the id, convert with `cmAt`, and emit `drop`. The page
  converts the point to a top-left with `topLeftForCentre`.
- [ ] **Spec:**
  - Placed pieces render one group each, with the rotation in the transform.
  - The selected piece gets the blue box, and a warned piece the dashed box.
  - A drag of +37 cm emits a `move` with a snapped value. At 100 % zoom, 37 cm is 29.6 px.
  - A click without movement emits `select` and no `move`.
  - Nothing moves when `arranging` is false.
  - A synthetic `drop` event with `dataTransfer` emits `drop` with cm coordinates.
- [ ] Commit: `feat(floor-planner): draw, select and move furniture on the canvas`.

### Task 5: Tray, inspector, layout tabs, name dialog

**Files:** the new components and `NameDialog` (renamed from `LabelDialog`), each with its spec.

- [ ] **`NameDialog`.** Rename the file with `git mv`. It takes the props `title`, `initial`,
  `placeholder` and `canDelete`, and its emits are unchanged. Update 1.2's room-label use and its
  spec.
- [ ] **`LayoutTray`** (left panel).
  - Props: `pieces` (furniture not in the layout), `placed` (furniture on it), `layoutName`,
    `selectedId` and `locked`.
  - When not locked, it shows only the "Lock the plan to arrange furniture." card with **Lock
    plan** (emits `lock`).
  - Otherwise it shows:
    - the heading "Tray · not in {layoutName}" with the hint "Drag a piece onto the plan.";
    - a card for each piece: `draggable="true"`, `@dragstart` sets the
      `application/x-fp-piece` data to the id with `effectAllowed = "copy"`, and the card holds a
      `FurnitureShape` thumbnail with the name and size;
    - the heading "On the plan · N" over the placed pieces, each a button that emits
      `select(id)`;
    - the empty tray state "Everything is on the plan.", and the no-furniture state "Add
      furniture first in the Furniture tab."
- [ ] **`PlacementInspector`** (right panel).
  - Props: `piece`, `placement`, `warnings: string[]`.
  - It shows a swatch with the name and "{Shape} · {colour}", then:
    - **Size** `sizeLabel`;
    - **Position** `x.xx m, y.yy m`, the rotated box's top-left;
    - **Rotation** `90°`.
  - Below that are the **Left** and **Right** buttons (emitting `rotate(-90 | 90)`), then each
    warning in B's warn box, followed by "You can leave it there, it's only a warning." Last comes
    **Back to tray** (emits `back`).
  - With nothing selected, the page shows a hint instead: "Select a piece on the plan, or drag one
    from the tray." along with the "1 square = 20 cm · pieces snap to 10 cm" card.
- [ ] **`LayoutTabs`.**
  - Props: `layouts`, `activeId`. It renders a `role="tablist"` of tab buttons, then
    **+ New layout**, **Duplicate**, **Rename** and **Delete**. Delete is disabled when only one
    layout remains.
  - Emits: `select`, `create`, `duplicate`, `rename` and `remove`.
- [ ] **`StatusBar`.** Add a default `<slot />` at the start of the bar, so the tabs sit on the
  left as in the mockup.
- [ ] **Specs:**
  - LayoutTray: the lock prompt appears when unlocked; `dragstart` sets the data type; the two
    sections render.
  - PlacementInspector: position and rotation text; rotate and back emits; warnings render.
  - LayoutTabs: the active tab has `aria-selected`; Delete is disabled when only one layout
    remains; each button emits.
  - StatusBar: slot content renders.
  - NameDialog: the title and `canDelete` props work.
- [ ] Commit: `feat(floor-planner): layout tray, placement inspector and layout tabs`.

### Task 6: Arrange mode in PlanPage

**Files:** `pages/PlanPage.vue` and its spec.

- [ ] **Local state:**
  - `activeLayoutId`: defaults to the first layout. If the active layout disappears after a
    refetch, it falls back to the first.
  - `selectedPlacedId`: cleared when switching layout or mode.
- [ ] **Computed:**
  - `activeLayout`.
  - `placed`: the active layout's placements joined with their furniture, each with `warned` from
    `warnings(...)` being non-empty.
  - `trayPieces` and `placedPieces`.
  - `selectedWarnings`: the selected piece's warnings, as text.
- [ ] **Wiring.**
  - The canvas gets `placed` only in Arrange mode, `arranging = mode === 'arrange' && locked`,
    and `droppable` the same.
  - `drop` calls `topLeftForCentre`, then `store.placePiece(...)` with rotation 0, and selects the
    piece.
  - `move` calls `placePiece` with the current rotation.
  - `rotate(delta)` calls `placePiece` with `(rotation + delta + 360) % 360` at the same x/y.
  - `back` calls `removePlacement` and clears the selection.
  - The tray's `lock` calls `store.lockWithSave()`.
- [ ] **Layout tabs.**
  - The tabs go in the `StatusBar` slot in Arrange mode.
  - **Create** calls `createLayout(store.nextLayoutName())` and switches to the new layout.
  - **Duplicate** switches to the copy.
  - **Rename** opens `NameDialog` with the title "Rename layout".
  - **Delete** asks for confirmation, then switches to the first layout.
- [ ] **Keyboard.** Extend `onKey` with refinement 8's keys for Arrange mode. The existing ⌘Z
  handling stays draw-only.
- [ ] **Page spec:**
  - Arrange mode on an unlocked plan shows the lock prompt, and its button locks.
  - On a locked plan the tray lists unplaced pieces.
  - A drop from the canvas places a piece at the centred, snapped top-left, sending a PUT.
  - Selecting a piece shows the inspector. **R** rotates (PUT with rotation 90), and Back to tray
    sends a DELETE.
  - A piece overlapping a wall shows the warning text in the inspector.
  - The tabs create, then switch to, "Layout B". Duplicate switches to the copy. Delete is
    disabled when only one layout remains.
- [ ] Run `npm test`, `npm run lint`, `npx vue-tsc --noEmit` and `npm run build`. Commit:
  `feat(floor-planner): arrange furniture in layouts (Story 1.4)`.

### Task 7: Story docs

- [ ] Update the spec's LA-3 (Back to tray is a button; dragging back onto the tray is out of
  scope) and LA-5 (overlaps of 1 cm or less don't warn). Then move to Task 8.

### Task 8: Browser check and hand-off

- [ ] Restart the backend dev server so it picks up the new routes. Then write
  `scratchpad/pw/arrange.mjs`. It runs at 1440 × 900 on fresh data, and creates the walls and
  furniture through the API first:
  1. Draw walls and floors through the API, lock the plan, and add furniture with a bulk POST.
  2. Arrange mode: screenshot the tray.
  3. Drag Sofa from the tray onto the living room with `page.dragAndDrop`, using
     `targetPosition`. Screenshot it.
  4. Move the sofa with the mouse, then press **R**. The centre must stay put; check this by
     reading `bounds` from the stored placement.
  5. Drag the Wardrobe across an inner wall. The dashed outline and the "Overlaps a wall" warning
     should both show. Screenshot it.
  6. **+ New layout** creates "Layout B" with an empty plan. Then switch back to A, Duplicate, and
     Rename the copy. Screenshot the tabs.
  7. Back to tray.
  8. Check the console for errors.
- [ ] Look at every screenshot. In particular, check that piece labels stay upright on rotated
  pieces, that the egg's wide end follows its rotation, and that a white piece is visible.
- [ ] Fill in the Dev Agent Record, move the story to `for-review/`, and commit:
  `docs(floor-planner): story 1.4 ready for review`.

## Review Focus

1. **Rotation keeps the centre in place.** The stored top-left stays fixed and only `rotation`
   changes; the rotated bounds are always derived. Pinned in Tasks 2 and 8.
2. **Placing a piece twice can't create a duplicate.** A second PUT for the same piece is an
   upsert. Pinned in Task 1.
3. **No piece is left stranded.** A placement's centre always stays on the plan, and resizing the
   plan prunes placements that fall off it. Pinned in Task 1.
4. **The locked-plan rule holds on the server, not just in the UI.** Pinned in Task 1.
5. **Optimistic moves reconverge.** A failed move refetches the server state, so the view never
   keeps a position the server rejected. Pinned in Task 3.
6. **Warnings never block a move.** They only add the outline and the inspector text. Pinned in
   Tasks 2 and 6.
