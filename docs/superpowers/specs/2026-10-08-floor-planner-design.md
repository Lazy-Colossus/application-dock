# Floor Planner — Design Spec

Date: 2026-10-08
App id: `floor-planner`
Status: draft, pending approval

## Problem

We are moving into a new apartment and want to work out where the furniture goes before we carry
it in. Paper sketches lose scale, and real floor-plan tools are heavier than the question needs.

## Intent

The app draws the apartment roughly on a square grid, the way a D&D battle map is drawn. Each
square is 20 cm. Furniture becomes true-to-scale pieces that you drag onto the locked plan, and
you compare a few arrangements. Jake and Dani share one apartment.

Success: you sketch the apartment in a few minutes. A 220 × 95 cm sofa is visibly too long for a
200 cm wall. You can flip between "Layout A" and "Layout B" to compare them.

## Scope

**In scope:**

- A new dock app, `floor-planner`, with a registry card, a route, a backend router and a story
  folder.
- **Desktop/laptop screen first.** Unlike most dock apps, it is not designed for phones. On a
  phone it renders but is not tuned.
- One apartment per group, with a 20 cm grid painted with brushes and locked once it is done.
- One shared furniture list. Each piece is either a basic shape or a painted shape, and pieces
  can be added one at a time or in bulk from a strict line format.
- Several named layouts per apartment. Each layout places the same furniture list differently.
- Scale is always visible: a "1 square = 20 cm" legend, metre rulers, a live size readout while
  drawing, and the dimensions of the selected piece.
- Sharing uses the ISS Vanguard model: an owner adds members, and everyone else gets their own
  apartment.

**Out of scope:**

- Live push between clients. Changes appear on reload (see NFR-a).
- Door swing arcs, wall thickness finer than one square, diagonal walls, and multiple floors.
- Furniture rotation other than 90° steps.
- Free-text or AI parsing of furniture lists. Only the strict format is supported.
- 3D, export, printing and image import (for example, tracing over a photo of the plan).
- Several apartments per person, or an apartment switcher.

## Requirements

### Floor plan

- **FP-1** A user with no apartment sees an empty one they own. The first write creates it.
- **FP-2** An apartment has a grid size in squares, set as width × depth in metres and rounded up
  to whole squares (default 10 m × 8 m, so 50 × 40 squares, with a 30 m limit on each side). The
  plan can be resized later: growing adds empty squares on the right and bottom edges, and
  shrinking crops them.
- **FP-3** Each square has a **surface** layer and a **feature** layer.
  - Surface is one of:
    - empty (outside the apartment)
    - `tile:<colour>`: white (default), grey, beige or black
    - `wood:<shade>`: light, medium (default) or dark
    - `carpet:<colour>`: grey (default), beige, blue or green
    - `balcony`
  - Feature is one of none, `wall`, `window`, `door` or `front_door`.
  - A feature is drawn on top of the surface, and a wall hides the surface completely.
- **FP-4** The brushes are: wall, window, door, front door, tile, wood, carpet, balcony and eraser.
  - Each surface brush has a colour or shade picker that starts on that brush's default.
  - The eraser clears both layers.
  - Every brush works in two modes: **freehand** (click or drag across squares) and
    **rectangle** (drag a box to fill it). Rectangle mode makes floors quick to fill and walls
    quick to draw as straight runs.
- **FP-5** While a stroke or rectangle is being drawn, a readout shows its size in metres, for
  example "3.40 m" or "3.40 × 2.80 m".
- **FP-6** Room labels are free text placed at a grid position. You can move, rename and delete
  them, and they are visible in every layout.
- **FP-7** Painting has an undo/redo stack on the client for the current editing session. Each
  stroke or rectangle counts as one step.
- **FP-8** The plan is **locked** or **unlocked**, and the flag is shared by everyone in the
  group. It must be unlocked to paint or edit labels, and it must be locked to arrange
  furniture. Unlocking does not move any placements.

### Furniture

- **FU-1** The furniture list is shared by every layout. Each piece has a name, a colour from a
  fixed palette, an optional note and a shape. The shapes are:
  - `rectangle`: width × depth in cm. A square is a rectangle with equal sides.
  - `round`: a diameter in cm.
  - `oval`: an ellipse, width × depth in cm.
  - `egg`: an asymmetric oval, width × depth in cm, with the wider end at the top before rotation.
  - `custom`: painted squares in a small grid editor, for shapes such as an L-shaped sofa. Its
    size is the bounding box of the painted squares.
- **FU-2** The colour palette is white, black, grey, beige, brown, red, orange, yellow, green,
  blue and purple.
- **FU-3** Basic shapes keep their exact size in cm and do not snap to squares. Custom shapes are
  measured in 20 cm squares, and the editor shows their size in cm as you paint.
- **FU-4** Bulk add uses a strict format, with one piece per line:
  `name; shape; size; colour[; note]`
  - Size is `W x D` in whole cm, or a single number for `round`. Shape and colour must be values
    from the lists above, and case does not matter.
  - Example: `Sofa; rectangle; 220 x 95; grey; IKEA Kivik`
  - The parser is a pure function on the frontend. It shows a preview table where each line is
    either valid or marked with the reason it failed. **Add** adds only the valid lines. The
    backend validates each piece again when it is saved.
- **FU-5** Editing a piece changes it in every layout. Deleting a piece removes its placement
  from every layout.

### Layouts

- **LA-1** An apartment has one or more named layouts, and a new apartment starts with
  "Layout A". You can add, rename, duplicate and delete layouts, but not delete the last one.
- **LA-2** A placement records the piece id, x and y in cm (the top-left corner before rotation)
  and a rotation of 0, 90, 180 or 270. Each piece is placed at most once per layout.
- **LA-3** Pieces with no placement in the current layout appear in a side tray. You drag a piece
  from the tray onto the plan to place it, and **Back to tray** removes it from the layout.
  Dragging a piece back onto the tray is out of scope: the tray uses HTML5 drag-and-drop and the
  plan uses pointer events, and joining the two isn't worth it.
- **LA-4** Dragging snaps to 10 cm (half a square). **R** or a button rotates the selected piece
  90° around its centre.
- **LA-5** The selected piece shows its name and its size in cm. A piece that overlaps a wall,
  covers an empty square, or overlaps another piece's bounding box gets a warning outline, but
  the move is still allowed. Pieces that only touch, overlapping by 1 cm or less, don't warn. A
  piece's centre must stay on the plan, and shrinking the plan removes pieces left off it.

### Sharing

- **SH-1** Membership follows ISS Vanguard RT-9 and RT-10, adapted to apartments:
  - The owner can add a dock user. This is refused when that user is already on another
    apartment that has other members, or when they own a non-empty apartment.
  - Members can leave.
  - The owner can remove members, and cannot leave while other members remain.
  - Every member can edit everything.

### Non-functional

- **NFR-a** There is no live push. Coarse plan writes (the drawn plan, lock and unlock) send the
  `plan_rev` they were based on. If the stored `plan_rev` has moved on, the server refuses with
  409 and the client says who changed it. Per-piece writes (furniture, placements) are
  last-write-wins and bump only `rev`, so editing furniture never makes a plan drawing go stale.
  Two people editing at the same moment is rare enough that this is enough.
- **NFR-b** Membership has a single source of truth (`memberships.json`), as in ISS Vanguard.
- **NFR-c** The geometry is stored in cm, and everything on screen is derived from it. Zooming
  never changes the stored geometry.

## Data model

### Files under `DATA_DIR/floor-planner/`

```
apartments/{apartment_id}.json
memberships.json                 { username: apartment_id }
```

### `ApartmentDoc`

```
id, owner, members, rev
cols: int, rows: int             grid size in 20 cm squares
surface: list[str]               rows strings, one token per square (see Encoding)
feature: list[str]
labels: list[{id, text, col, row}]
locked: bool
furniture: list[Furniture]
layouts: list[Layout]            display order
```

`Furniture` = `{id, name, colour, note, shape, width_cm, depth_cm, cells: list[str] | None}`.
`cells` is only used by `custom` shapes and is a row mask of `#` and `.`.

`Layout` = `{id, name, placements: list[{furniture_id, x_cm, y_cm, rotation}]}`.

### Encoding

Each grid row is a string of fixed-width two-character codes. For example, `..` is empty, `t0`
is white tile and `w1` is medium wood. One `codes.ts` / `Literal` table on each side maps codes
to brush values. A 50 × 40 plan is then about 8 KB, and a diff of the JSON file stays readable.

## Backend

These modules mirror `iss_vanguard_*` and use the same names where possible:

- `app/schemas/floor_planner.py`
- `app/repositories/floor_planner_repo.py`: `read_apartment`, `write_apartment` (an atomic
  write), `apartment_transaction`, `new_apartment`, `delete_apartment`, `membership_lock`,
  `read_memberships`, `write_memberships`. The lock is always taken on membership first and then
  on the apartment.
- `app/services/floor_planner_service.py`: raises `FileNotFoundError`, `ValueError`, and a
  `StaleRevError` for NFR-a. It enforces the lock rules from FP-8 (painting while locked or
  placing while unlocked raises `ValueError`).
- `app/routers/floor_planner.py`, prefix `/api/floor-planner`. It maps `FileNotFoundError` to
  404, `ValueError` to 422 and `StaleRevError` to 409. Every write takes `base_rev` and returns
  the full `ApartmentView`.

| Method & path | Does |
|---|---|
| `GET /apartment` | FP-1 |
| `PUT /apartment/plan` | Replaces the grid, labels and size (FP-2 to FP-6). Sent on save. |
| `POST /apartment/lock`, `/unlock` | FP-8 |
| `POST /apartment/furniture` | Adds one or more pieces (FU-1, FU-4) |
| `PUT` / `DELETE /apartment/furniture/{id}` | FU-5 |
| `POST /apartment/layouts`, `PUT` / `DELETE /apartment/layouts/{id}` | LA-1 |
| `POST /apartment/layouts/{id}/duplicate` | LA-1 |
| `PUT /apartment/layouts/{id}/placements/{furniture_id}` | Places or moves a piece (LA-2) |
| `DELETE /apartment/layouts/{id}/placements/{furniture_id}` | Returns a piece to the tray (LA-3) |
| `POST` / `DELETE /apartment/members[/{username}]` | SH-1 |

Each piece and placement has its own endpoint, so two people arranging different pieces rarely
collide. Plan painting is the only coarse write, and it is sent once when you press **Save** (or
when you lock the plan), not on every stroke.

## Frontend (`src/apps/floor-planner/`)

- **Rendering:** one SVG whose `viewBox` is measured in cm. Scale is preserved automatically, and
  zoom and pan are a transform on top. Surface squares are drawn as merged horizontal runs so
  that a 2,000-square plan stays light. Rulers are marked every metre, and the legend reads
  "1 square = 20 cm".
- **Units:**
  - `codes.ts`: brush, colour and shape vocabularies.
  - `grid.ts`: pure helpers to encode and decode, paint, fill rectangles and resize.
  - `furnitureFormat.ts`: the FU-4 parser.
  - `geometry.ts`: rotated bounding boxes, the snap rule and the LA-5 overlap checks.
- **Store:** `stores/useFloorPlanStore.ts` uses Pinia and exposes `apartment`, `loading` and
  `error`. All calls go through `useApi`.
- **Pages and components:**
  - `PlanPage` has three modes: Draw (when unlocked), Furniture and Arrange (when locked), each
    with a layout picker.
  - `BrushPalette`
  - `FurnitureList`
  - `BulkAddDialog`
  - `CustomShapeEditor`
  - `LayoutTray`
  - `MembersDialog`
- Tests: the pure units (`grid`, `furnitureFormat`, `geometry`) and the store have spec files
  next to them. On the backend, `tests/test_floor_planner_*.py` covers the lock rules, the
  stale-rev check, membership and cascade deletes.

## UI — design B, "Drafting table"

Chosen from two mockups on 2026-10-08:
https://claude.ai/artifact/1nK3cQ36cNrwLq4GeTg8BV (the B artboards).

- **Light ground**, IBM Plex Sans with IBM Plex Mono for every measurement, and a blueprint blue
  accent (`#1d4ed8`). Like KitchenCraft, it needs a light shell header variant
  (`app-bar--floor-planner`) so the dark dock bar does not sit on top of it.
- **Top bar:** the app name, a Draw plan · Furniture · Arrange switch, a lock chip with a
  Lock/Unlock button, and member avatars.
- **Three columns:** a left panel, the plan in the centre, and a right panel. What the side
  panels show depends on the mode:

  | Mode | Left panel | Right panel |
  |---|---|---|
  | Draw plan | Structure brushes, floor brushes with inline colour chips, Eraser and Room label, the Freehand/Rectangle switch, Undo/Redo | A scale card ("1 square = 20 cm" with a 1 m scale bar), plan size and resize, the room label list |
  | Furniture | The furniture list | The piece form or the custom-shape editor, with a to-scale preview. **Bulk add** opens a dialog. |
  | Arrange | The tray of pieces not in this layout, then the pieces already on the plan | The selected piece: size, position in m, rotation buttons, warnings, Back to tray |

- **Bottom bar:**
  - In Arrange, the layouts appear as tabs, followed by "+ New layout" and "Duplicate".
  - In every mode it ends with a status readout: the cursor position in metres, the size of the
    shape being drawn, and the zoom level. In Draw plan it also shows the unsaved-changes
    indicator and Save.
- **Plan view:** rulers in metres on the top and left edges, thin lines every square and darker
  lines every metre (as on Roll20), room labels in small capitals, and a dark readout chip next to
  the shape being drawn.
- The Furniture mode was not mocked up. It follows the same three columns and styling.

## Suggested story split

1. Register the app, the apartment store and membership (FP-1, SH-1, NFR-a/b).
2. The grid editor: brushes, rectangle mode, readouts, undo, resize, labels and lock (FP-2 to
   FP-8).
3. The furniture list: shapes, the custom shape editor and bulk add (FU-1 to FU-5).
4. Layouts: the tray, drag, snap, rotate, overlap warnings, and duplicating layouts (LA-1 to
   LA-5).
