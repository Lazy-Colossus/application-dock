# Floor Planner 1.2: Draw the Floor Plan (Implementation Plan)

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Work task by task:
> run each task's tests, then commit.

**Goal:** In Draw plan mode, you paint the apartment onto the 20 cm grid with the brushes from
design B. You see real sizes while you draw, undo and redo, resize the plan, place room labels,
and save. On a locked plan nothing can be painted.

**Architecture:**
- **Backend:** one coarse, rev-checked write, `PUT /apartment/plan`. It replaces the size, both
  layers and the labels in one go, and is refused while the plan is locked.
- **Frontend draft:**
  - Painting happens on a client-side **draft**. This is a copy of the plan held in the store,
    with an undo/redo history of snapshots. Only **Save** (or **Lock plan**) sends it.
  - Pure helpers in `codes.ts`, `grid.ts` and `history.ts` do all the grid work.
- **Frontend rendering:**
  - `PlanCanvas.vue` renders one SVG whose `viewBox` is in centimetres, and turns pointer events
    into cell coordinates.
  - The side panels and the status bar only read and emit.

**Spec:** `docs/superpowers/specs/2026-10-08-floor-planner-design.md` (FP-2 to FP-8, Encoding,
UI). **Story:** `docs/stories/floor-planner/1.2.draw-the-floor-plan.story.md`.
**Mockup:** the "B · Drafting table — drawing the plan" artboard at
https://claude.ai/artifact/1nK3cQ36cNrwLq4GeTg8BV. **Builds on:** story 1.1 (`509346f`).

## Global Constraints

Same as the 1.1 plan:
- Branch `feat/floor-planner-app`, with the co-author line on every commit.
- Strict router → service → repo layering. `black`/`ruff` at line length 100.
- All HTTP goes through `useApi`. The store exposes `loading`, `error` and `notice`.
- `<script setup lang="ts">`, no `any`, minimal comments.
- Measurements always render in `.fp-mono`.

## Refinements to the spec (decided while planning)

1. **Cell codes.** Each square is two lowercase characters per layer, and `..` means empty.

   | Layer | Codes |
   |---|---|
   | Surface | `t0`–`t3` tile white/grey/beige/black · `w0`–`w2` wood light/medium/dark · `c0`–`c3` carpet grey/beige/blue/green · `b0` balcony |
   | Feature | `wl` wall · `wn` window · `dr` door · `fd` front door |

   The codes are defined once in `app/schemas/floor_planner.py` (as two frozensets) and once in
   `src/apps/floor-planner/codes.ts`.

2. **Size bounds.** The plan can be 5–150 squares on each side, which is 1–30 m. The resize
   inputs take metres and round up with `ceil(m * 5)`.

3. **Brush rules.**
   - A floor brush writes the surface layer.
   - A structure brush writes the feature layer and leaves the surface underneath alone. The
     wall only *hides* the surface when drawn, so erasing a wall brings the floor back.
   - The eraser clears both layers.

4. **Freehand strokes don't skip squares.** Consecutive pointer samples are joined with a
   Bresenham line, so a fast drag still paints every square it crosses.

5. **The size readout** is measured on the stroke's bounding box. If either side is one square,
   it shows the longer side alone ("3.40 m"). Otherwise it shows "W × D m" ("1.60 × 2.60 m"),
   prefixed with the brush name, for example "Tile · 1.60 × 2.60 m".

6. **A stale plan save keeps your drawing.** A 1.1 write that loses a race simply reloads, but
   losing a whole drawing would hurt. So a 409 on `savePlan` keeps the draft, refetches the
   server copy underneath it, and shows "dani changed the plan. Save again to replace it with
   yours, or Discard to see theirs." Saving again sends the fresh `rev`, so it overwrites.
   Overwriting with notice is the intended behaviour for this coarse write.

7. **Lock plan with unsaved changes** saves first, then locks using the `rev` from the save's
   response. If the save fails, nothing is locked.

8. **Labels.**
   - With the Label tool active:
     - clicking an empty square opens a small dialog to name a new label;
     - dragging an existing label moves it;
     - clicking an existing label opens a dialog to rename or delete it.
   - The right panel lists the labels, each with Rename and Delete.
   - Label text is trimmed, cannot be blank, and is at most 40 characters.
   - Shrinking the plan drops any label left outside the grid. The backend refuses labels outside
     the grid, so the client must drop them first.

9. **Zoom.** The levels are 50 / 75 / 100 / 150 / 200 %, where 100 % = 0.8 px per cm (16 px per
   square, as in the mockup). Zoom is a local ref and only changes the SVG's `width` and
   `height`, never the `viewBox` (NFR-c). The plan area scrolls to pan.

10. **Keyboard.** ⌘/Ctrl+Z undoes and ⇧⌘/Ctrl+Shift+Z redoes. The listener is on the page's
    root element (`tabindex="-1"`, focused on mount), not on `window`, and it ignores events
    from inputs.

11. **Other modes.** Furniture and Arrange show the same canvas read-only, with no brushes. They
    are filled in by 1.3 and 1.4.

## File Structure

**Backend (modify):** `app/schemas/floor_planner.py` (codes, `PlanWriteRequest`),
`app/services/floor_planner_service.py` (`replace_plan`), `app/routers/floor_planner.py`
(`PUT /apartment/plan`). **Tests (create):** `tests/test_floor_planner_plan.py`. **Tests
(modify):** `tests/test_floor_planner_router.py`.

**Frontend (create, under `src/apps/floor-planner/`):**
- Pure helpers with specs: `codes.ts`, `grid.ts`, `history.ts`.
- Components with specs: `components/PlanCanvas.vue`, `components/DrawPanel.vue`,
  `components/PlanInfoPanel.vue`, `components/StatusBar.vue`, `components/LabelDialog.vue`.

**Frontend (modify):** `stores/useFloorPlanStore.ts` and its spec, `pages/PlanPage.vue` and its
spec.

---

### Task 1: Backend validates and replaces the plan

**Files:** `schemas/floor_planner.py`, `services/floor_planner_service.py`,
`routers/floor_planner.py`, `tests/test_floor_planner_plan.py`, `tests/test_floor_planner_router.py`.

- [ ] **Schema.** Add the following:

```python
SURFACE_CODES = frozenset({EMPTY_CELL, "t0", "t1", "t2", "t3", "w0", "w1", "w2",
                           "c0", "c1", "c2", "c3", "b0"})
FEATURE_CODES = frozenset({EMPTY_CELL, "wl", "wn", "dr", "fd"})
MIN_SIDE = 5    # 1 m
MAX_SIDE = 150  # 30 m (FP-2)
LABEL_MAX = 40


class PlanWriteRequest(BaseModel):
    base_rev: int
    cols: int = Field(ge=MIN_SIDE, le=MAX_SIDE)
    rows: int = Field(ge=MIN_SIDE, le=MAX_SIDE)
    surface: list[str]
    feature: list[str]
    labels: list[Label]
```

- [ ] **Service.** Add `replace_plan(username, req)`. It runs `_mutate` with these checks, all
  raising `ValueError` with a readable message:
  - The plan is locked: "Unlock the plan to change it".
  - Either layer does not have exactly `rows` rows of exactly `2 * cols` characters.
  - A two-character token is not in its layer's set. The message names the first bad token and
    its square, for example `"unknown surface code 'zz' at column 3, row 7"`.
  - Labels:
    - duplicate label ids;
    - text that is blank after stripping, or longer than `LABEL_MAX` (text is stored stripped);
    - `col`/`row` outside `0 ≤ col < cols`, `0 ≤ row < rows`.

  The service then assigns `cols`, `rows`, `surface`, `feature` and `labels`. Tokens are split
  with `[row[i:i + 2] for i in range(0, len(row), 2)]`.
- [ ] **Router.** Add `PUT /apartment/plan` with a `PlanWriteRequest` body, calling
  `replace_plan`.
- [ ] **Tests:** `test_floor_planner_plan.py`, using the 1.1 service fixture.
  - A round trip: paint a wall, a tile and a label on a 10 × 8 plan. The view returns them
    exactly, and `rev` is 1.
  - Resizing to 60 × 45 is stored.
  - Refusals, parametrised:
    - locked;
    - a row too short;
    - one row too many;
    - `"zz"` in the surface layer;
    - `"t0"` in the feature layer;
    - `"wl"` in the surface layer;
    - a label at `col == cols`;
    - a blank label;
    - a 41-character label;
    - duplicate label ids.
  - A stale `base_rev` raises `StaleRevError`.
  - Router: 200 when valid, 422 when locked, 422 for `cols=151`, and 409 when stale.
- [ ] Run `.venv/bin/pytest tests/test_floor_planner_*.py`, then `black` and `ruff`. Commit:
  `feat(floor-planner): replace the plan in one rev-checked write`.

### Task 2: Vocabulary and grid helpers

**Files:** `codes.ts`, `grid.ts` and their specs.

- [ ] **`codes.ts`.** Define the codes in display order, with the colours from the mockup:
  - `EMPTY = ".."` and `type Layer = "surface" | "feature"`.
  - `interface Swatch { code: string; name: string; colour: string }`.
  - `FLOORS`: Tile, Wood, Carpet and Balcony, each `{ id, label, swatches: Swatch[],
    defaultCode }`, with the defaults `t0`, `w1`, `c0` and `b0`.
  - `STRUCTURE`: Wall `#2f2f2f`, Window `#8cc4e6`, Door `#e3a548` and Front door `#9c3b25`.
  - `type BrushId = "wall" | "window" | "door" | "front_door" | "tile" | "wood" | "carpet" |
    "balcony" | "eraser" | "label"`.
  - `interface Brush { id: BrushId; layer: Layer | "both" | null; code: string }`. The `code` is
    the chosen swatch for a floor brush.
  - `fillFor(code)`: the CSS fill for rendering. Balcony returns the id of an SVG pattern.

  The swatch colours are:

  | Floor | Colours |
  |---|---|
  | Tile | `#f4f3ee` / `#cfcdc6` / `#e2d6bd` / `#2a2a2a` |
  | Wood | `#d6ae80` / `#a8743f` / `#6b4426` |
  | Carpet | `#8e939b` / `#d8c9a8` / `#5b7fae` / `#6f9467` |

- [ ] **`grid.ts`.** These are pure functions and never mutate their inputs. A plan is
  `interface PlanGrid { cols; rows; surface: string[]; feature: string[]; labels: Label[] }`.

```ts
export interface Cell { col: number; row: number }

export function emptyRows(cols: number, rows: number): string[];
export function codeAt(rows: string[], cell: Cell): string;
/** Bresenham: every square from a to b inclusive, so fast drags leave no gaps. */
export function lineCells(a: Cell, b: Cell): Cell[];
export function rectCells(a: Cell, b: Cell): Cell[];             // inclusive, any corner order
export function paint(grid: PlanGrid, cells: Cell[], brush: Brush): PlanGrid;
export function resize(grid: PlanGrid, cols: number, rows: number): PlanGrid; // crops labels too
/** Same-code horizontal runs per row, empties skipped — what the canvas draws. */
export function runs(rows: string[]): { row: number; col: number; len: number; code: string }[];
export function bounds(cells: Cell[]): { cols: number; rows: number };
export function readout(cells: Cell[], brushLabel: string): string;  // refinement 5
export const metres = (squares: number) => (squares * 0.2).toFixed(2);
export const squaresFor = (m: number) => Math.ceil(Math.round(m * 500) / 100);   // see below
```

  `paint` ignores cells outside the grid. In `squaresFor`, the inner rounding cancels
  floating-point noise: without it, 8.8 m would give `ceil(44.000000000000004)`, which is 45.

- [ ] **Spec cases:**
  - `lineCells`: horizontal, vertical, diagonal, and a steep line all have no gaps.
  - `rectCells`: corner order doesn't matter.
  - `paint`:
    - a wall leaves the surface code intact;
    - the eraser clears both layers;
    - a floor brush leaves the feature layer intact;
    - cells outside the grid are ignored.
  - `resize`: growing pads with `..` on the right and bottom; shrinking crops and drops labels
    that fall outside.
  - `runs`: merges `t0t0t0` into one run and skips empties.
  - `readout`: one square wide gives "Wall · 3.40 m"; a box gives "Tile · 1.60 × 2.60 m".
  - `squaresFor`: 8.8 → 44, 8.81 → 45, 1 → 5.
- [ ] Run `npx vitest run src/apps/floor-planner`, then commit:
  `feat(floor-planner): plan codes and pure grid helpers`.

### Task 3: Undo history and the draft in the store

**Files:** `history.ts` and its spec; `stores/useFloorPlanStore.ts` and its spec.

- [ ] **`history.ts`.** A generic snapshot stack: `createHistory<T>(initial)` returns
  `{ present, push(next), undo(), redo(), canUndo, canRedo }`. `push` clears the redo stack.
  The specs cover push/undo/redo and that a push after an undo drops the redo stack.
- [ ] **Store additions:**
  - `draft: PlanGrid | null` (via a `history` ref) and
    `dirty = computed(() => history.value?.canUndo ?? false)`.
  - `startDraft()` begins a history from the server apartment's plan, unless one is already
    running.
  - `applyStroke(cells, brush)` calls `startDraft()`, then `history.push(paint(present, cells,
    brush))`. It is called **once per stroke or rectangle** (FP-7). While the pointer is down,
    the canvas shows a preview instead.
  - `resizePlan(cols, rows)`, `addLabel(text, cell)`, `moveLabel(id, cell)`,
    `renameLabel(id, text)` and `deleteLabel(id)` each push one history step. New label ids are
    `"lb_" + crypto.randomUUID()`.
  - `undo()`, `redo()`, `discardDraft()` (which sets history to null).
  - `savePlan()` PUTs `{ base_rev, cols, rows, surface, feature, labels }` from the present
    snapshot.
    - On success: set the apartment and clear the draft.
    - On a 409 (refinement 6): keep the draft, refetch, and set `notice` to
      `` `${detail.replace(/ changed this$/, "")} changed the plan. Save again to replace it
      with yours, or Discard to see theirs.` `` The other writes keep 1.1's generic 409
      handling.
    - On other errors: set `error` and keep the draft.
  - `lockWithSave()` (refinement 7): if `dirty`, await `savePlan()` and stop if it failed; then
    `lock()`.
  - `plan`: a computed that returns the draft's present snapshot if there is one, otherwise the
    apartment's plan. Every component reads this.
- [ ] **Store spec additions:**
  - one stroke makes one undo step;
  - undo, then redo;
  - save clears the draft and sends the present snapshot with `base_rev`;
  - a 409 on save keeps the draft and sets the "Save again" notice;
  - `lockWithSave` makes a save call and then a lock call, using the `rev` from the save;
  - `lockWithSave` does not lock when the save fails;
  - `discardDraft` falls back to the server plan.
- [ ] Commit: `feat(floor-planner): local plan draft with undo and save`.

### Task 4: PlanCanvas

**Files:** `components/PlanCanvas.vue` and its spec.

- [ ] **Props:** `plan: PlanGrid`, `zoom: number`, `editable: boolean`, `brush: Brush | null`,
  `shape: "freehand" | "rectangle"`.
  **Emits:**
  - `stroke: [cells: Cell[]]` when the pointer is released;
  - `hover: [cell: Cell | null]`;
  - `preview: [readout: string | null]`;
  - `labelAt: [cell: Cell]`, when clicking an empty square with the Label tool;
  - `labelPick: [id: string]`;
  - `labelMove: [id: string, cell: Cell]`.
- [ ] **SVG.** `RULER = 40` cm.
  - The `viewBox` is `` `${-RULER} ${-RULER} ${cols * 20 + RULER} ${rows * 20 + RULER}` ``, and
    the width and height are the viewBox size times `0.8 * zoom` px.
  - In `<defs>`:
    - a 20 × 20 `pattern` with one thin line (`rgba(0,0,0,.09)`);
    - a 100 × 100 `pattern` with one darker line (`rgba(0,0,0,.26)`);
    - the balcony hatch.
  - The layers, back to front:
    1. the empty ground `#fbfbf9`;
    2. surface `runs` as `rect`s;
    3. the grid patterns;
    4. feature `runs`;
    5. labels (`<text>` in small caps with a white `paint-order` halo);
    6. the stroke preview: painted cells at 60 % opacity, with a dashed `#1d4ed8` outline for
       rectangle mode;
    7. the readout chip (a dark `rect` + `text`) placed above the top-left of the preview.
  - The rulers are two bands with metre ticks labelled `0, 1, 2…`, as in the mockup.
- [ ] **Pointer handling.**
  - `cellFromEvent(e)` is exported as a pure helper `cellAt(clientX, clientY, rect, zoom)` so it
    can be tested. It computes `cm = (client - rect.edge) / (0.8 * zoom) - RULER`, then
    `floor(cm / 20)`, and returns `null` outside the grid.
  - `pointerdown` calls `setPointerCapture` and starts the stroke.
  - `pointermove`:
    - freehand: appends `lineCells(last, cell)`;
    - rectangle: recomputes `rectCells(start, cell)`.
  - `pointerup` emits `stroke` with the unique cells.
  - `pointercancel` drops the stroke.
  - Nothing is emitted when `editable` is false.
- [ ] **Spec** (happy-dom; stub `getBoundingClientRect` and `setPointerCapture` on the svg):
  - `cellAt` maths at 100 % and 200 %;
  - a freehand drag from (0,0) to (3,0) emits 4 cells;
  - a rectangle drag from (1,1) to (2,3) emits 6 cells;
  - when not editable, nothing is emitted;
  - with the Label tool, a click on an empty square emits `labelAt`;
  - `runs` render as the right number of `rect`s.
- [ ] Commit: `feat(floor-planner): SVG plan canvas drawn in centimetres`.

### Task 5: Panels, status bar, label dialog

**Files:** `components/DrawPanel.vue`, `PlanInfoPanel.vue`, `StatusBar.vue`, `LabelDialog.vue`
and their specs.

- [ ] **`DrawPanel`** (left), following the mockup:
  - **Structure** rows: four brushes, each with a swatch and a name.
  - **Floors**: Tile, Wood, Carpet and Balcony. The active one gets the blue-tint card, and each
    shows round swatch chips (`aria-label` = the colour name). Choosing a chip also selects that
    floor.
  - **Tools**: Eraser and Room label.
  - **Draw as**: Freehand / Rectangle.
  - **Undo** and **Redo**, disabled from `canUndo` / `canRedo`.
  - Props: `brush`, `shape`, `canUndo`, `canRedo` and `locked`. When locked, every control is
    disabled and a hint reads "Unlock the plan to draw."
  - Emits: `update:brush`, `update:shape`, `undo` and `redo`.
- [ ] **`PlanInfoPanel`** (right):
  - The **Scale** card: "1 square = 20 cm", a five-segment 1 m bar, and "Every 5 squares is
    1 m, marked with a darker grid line."
  - **Plan size**: `W × D m` in mono, "`cols` × `rows` squares", and width/depth inputs in metres
    with **Resize**. Resize is disabled when locked. Shrinking that would drop labels asks for
    confirmation first ("Shrinking removes 2 labels outside the new size.").
  - **Room labels**: a list with Rename and Delete.
  - Emits: `resize`, `rename`, `delete`.
- [ ] **`StatusBar`**:
  - "Cursor `x m, y m`", from the hover cell's top-left corner, or "—".
  - The drawing readout, while there is one.
  - "Unsaved changes" with **Discard** and **Save** (primary), shown when `dirty`.
  - The zoom controls, − / % / +, which step through the five levels.
  - "1 square = 20 cm".
- [ ] **`LabelDialog`**: a text input (`maxlength="40"`), Save, Cancel, and Delete when editing.
  It emits `save: [text]` or `delete`. Save is disabled while the trimmed text is blank.
- [ ] **Specs:**
  - DrawPanel: selecting a chip emits a brush with that code and the floor's id; locked disables
    everything; undo is disabled when `canUndo` is false.
  - PlanInfoPanel: resize emits squares using `squaresFor`; the shrink confirm appears only when
    labels would be dropped.
  - StatusBar: the cursor text in metres; Save and Discard appear only when dirty; zoom steps and
    clamps.
  - LabelDialog: blank text cannot be saved; the text is emitted trimmed.
- [ ] Commit: `feat(floor-planner): draw panel, plan info, status bar and label dialog`.

### Task 6: Put it together in PlanPage

**Files:** `pages/PlanPage.vue` and its spec.

- [ ] **Layout.**
  - The left column shows `DrawPanel` in draw mode.
  - The centre shows `PlanCanvas` with `:plan="store.plan"` and `:editable="mode === 'draw' &&
    !locked"`.
  - The right column shows `PlanInfoPanel` in draw mode.
  - `StatusBar` replaces 1.1's bottom bar.
  - The panels of the other modes stay empty.
- [ ] **Local state:** `brush` (default: Tile `t0`), `shape` (default `"rectangle"`, as in the
  mockup), `zoom` (default 1), `hover`, `previewText`, and the label dialog's state.
- [ ] **Wiring:**
  - `stroke` → `store.applyStroke`.
  - `labelAt` → open the dialog, then `addLabel`. `labelPick` → the dialog in edit mode.
    `labelMove` → `moveLabel`.
  - The lock button calls `store.lockWithSave()` instead of `lock()`.
  - Unlock does not change.
- [ ] **Keyboard:** add refinement 10's undo/redo handler on the root element.
- [ ] **Leave guard:** `onBeforeRouteLeave` asks "Leave without saving? Your drawing since the
  last save will be lost." when `dirty`, following Tea's `NewWarePage`. Also add a
  `beforeunload` listener while `dirty`, removed on unmount.
- [ ] **Notice banner:** when the notice is the plan-conflict one, it gains a **Discard** button
  that calls `store.discardDraft()`.
- [ ] **Page spec:**
  - Draw mode shows the brushes, and Furniture mode hides them.
  - A stroke from the canvas, then Save, sends the PUT.
  - Lock with unsaved changes sends the PUT before the lock.
  - When locked, the canvas is not editable and the panel hint shows.
  - ⌘Z undoes.
  - The leave guard calls `confirm` only when dirty (stub `window.confirm`).
- [ ] Run `npm test`, `npm run lint` and `npx vue-tsc --noEmit`, then commit:
  `feat(floor-planner): draw the floor plan (Story 1.2)`.

### Task 7: Verify and hand off

- [ ] Run the full gate on the backend and frontend, plus `npm run build`.
- [ ] Manual check in the browser:
  1. Rectangle-fill the living room with medium wood. The readout shows "Wood · 4.40 × 5.40 m".
  2. Freehand a wall quickly along the top. It should have no gaps.
  3. Erase a window, and the wood floor should reappear.
  4. Check that undo and redo each move one stroke.
  5. Add, move, rename and delete a label.
  6. Resize down and back up again.
  7. Save, then reload: everything is kept.
  8. Lock with unsaved changes: the drawing is saved and the plan locked, and the brushes are
     disabled.
  9. With two browsers: Jake saves while Dani has unsaved strokes. Dani's Save shows the
     conflict notice, and pressing Save again overwrites.
- [ ] Fill in the story's Dev Agent Record, move it to `for-review/`, and commit:
  `docs(floor-planner): story 1.2 ready for review`.

## Review Focus

1. **The wall hides the surface but doesn't erase it.** Erasing a wall brings the floor back.
   Pinned in Task 2.
2. **One stroke is one undo step.** The canvas emits once on pointer-up and never while moving.
   Pinned in Tasks 3 and 4.
3. **A conflict doesn't lose the drawing.** A 409 on save keeps the draft, and Save again
   overwrites. Pinned in Task 3.
4. **Lock with unsaved changes.** It saves, then locks against the new `rev`, and never locks if
   the save failed. Pinned in Tasks 3 and 6.
5. **The server never trusts the grid.** Row shapes, per-layer codes, size bounds and label
   bounds are all checked in Task 1. Labels outside the grid are dropped on the client before
   saving (Task 2's `resize`).
6. **Zoom never touches the stored centimetres.** Only the SVG's pixel size changes. Pinned in
   Task 4's `cellAt` maths.
