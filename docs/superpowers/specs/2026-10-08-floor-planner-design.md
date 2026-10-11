# Floor Planner — Design Spec

Date: 2026-10-08
App id: `floor-planner`
Status: draft, pending approval

## Problem

We are moving into a new apartment and want to work out where the furniture goes before we carry
it in. Paper sketches lose scale, and real floor-plan tools are heavier than the question needs.

## Intent

The app draws the apartment roughly on a square grid, the way a D&D battle map is drawn. Each
square is 20 cm. Furniture becomes true-to-scale pieces that you drag onto the plan, and
you compare a few arrangements. Jake and Dani share one apartment.

Success: you sketch the apartment in a few minutes. A 220 × 95 cm sofa is visibly too long for a
200 cm wall. You can flip between "Layout A" and "Layout B" to compare them.

## Scope

**In scope:**

- A new dock app, `floor-planner`, with a registry card, a route, a backend router and a story
  folder.
- **Desktop/laptop screen first.** Unlike most dock apps, it is not designed for phones. On a
  phone it renders but is not tuned.
- Several apartments per user (Story 1.5), each with a 20 cm grid painted with brushes. A
  switcher in the top bar opens, creates, duplicates, renames and
  deletes them.
- One shared furniture list. Each piece is either a basic shape or a painted shape, and pieces
  can be added one at a time or in bulk from a strict line format.
- Several named layouts per apartment. Each layout places the same furniture list differently.
- Scale is always visible: a "1 square = 20 cm" legend, metre rulers, a live size readout while
  drawing, and the dimensions of the selected piece.
- Sharing: an apartment's owner adds members, who see and edit everything in it. Each member
  keeps their other apartments.

**Out of scope:**

- Live push between clients. Changes appear on reload (see NFR-a).
- Sliding doors, wall thickness finer than one square, diagonal walls, and multiple floors.
- Free-text or AI parsing of furniture lists. Only the strict format is supported.
- 3D, export, printing and image import (for example, tracing over a photo of the plan).

## Requirements

### Floor plan

- **FP-1** A user with no apartment gets an empty one called "My apartment" that they own, created
  when they first list their apartments (Story 1.5; before that it was created on the first
  write).
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
- **FP-8** *Removed 2026-10-09.* The plan used to be locked to arrange furniture and unlocked to
  paint. Draw plan, Furniture and Arrange are separate tabs, so arranging can't change the plan
  by accident: the plan can be painted at any time and furniture arranged at any time. Leaving
  Draw plan saves any unsaved drawing first, because placements are checked against the saved
  plan's size. Old apartment files with a `locked` flag still load; the flag is ignored.
- **FP-9** The drawing saves itself about 1.5 s after the last change, and Save saves at once.
  The status bar shows Saving… / Saved / Unsaved. The undo history survives saves for the rest of
  the editing session, unless someone else's plan write moves the plan on under a
  clean drawing, which drops it. Switching apartments or leaving the page saves first. After a
  lost race (NFR-a) autosave stops until the user picks Save again or Discard.
- **FP-10** A door is a group of touching door (or front door) squares, drawn as a door rather
  than as painted squares: the opening in the door's colour, the door leaf in the door's colour, and a pale wedge for
  the space it sweeps, drawn over furniture so a swing that hits a piece shows (design B of the
  door study, 2026-10-09: https://claude.ai/artifact/JLVWCANm3CxUThiE3e1LPK).
  - Clicking a door with the Door or Front door brush opens its setup beside it; dragging
    still paints. The setup sets which side it **opens into**, named after the room labels on
    each side ("Bedroom / Living room"; a front door says "Into the flat / Outwards"; an
    unlabelled side is "Inside", or "Outside" when it really is outdoors), the **hinge** end, and **Single** or **Double** (two
    half leaves meeting in the middle). These are saved with the plan, as one undo step each.
  - A door without a setup opens up or left, hinged at the left or top; a front door opens
    into the flat. Painting a door away drops its setup.
  - A dot on each leaf, its handle, swings the door open or shut in any mode; in Arrange so does
    a click on the opening or the leaf, and so does the setup's **Show it**. The pointer shows
    wherever a click on a door does something. Open or closed is only that viewer's view, like zoom: never saved or
    shared. Doors start open.

### Apartments (Story 1.5)

- **AP-1** A user belongs to one or more apartments. The top bar names the open one; its menu
  lists them all, most recently changed first, with their members. The URL is
  `/floor-planner/<id>`, and `/floor-planner` opens the most recently changed one.
- **AP-2** **New apartment** asks for a name and creates an empty apartment with
  "Layout A", owned by the user.
- **AP-3** **Duplicate** asks for a name (default "<name> copy") and copies the plan, labels,
  furniture and every layout with its placements. The copy belongs to the user alone.
- **AP-4** Any member can rename an apartment; names are 1–60 characters.
- **AP-5** Only the owner can delete an apartment, after a confirmation. It is gone for every
  member, and the user lands on their next apartment (or a fresh one, FP-1).
- **AP-6** A user belongs to at most 20 apartments, owned or shared.

### Furniture

- **FU-1** The furniture list is shared by every layout. Each piece has a name, a colour from a
  fixed palette, an optional note and a shape. The shapes are:
  - `rectangle`: width × depth in cm. A square is a rectangle with equal sides.
  - `round`: a diameter in cm.
  - `oval`: an ellipse, width × depth in cm.
  - `egg`: an asymmetric oval, width × depth in cm, with the wider end at the top before rotation.
  - `custom`: painted squares, for shapes such as an L-shaped sofa or a sofa with cushions in
    another colour. Each square has its own palette colour. Its size is the bounding box of the
    painted squares.
- **FU-2** The colour palette is white, black, grey, beige, brown, red, orange, yellow, green,
  blue, purple, tan, pink, navy, teal, olive and charcoal. The palette shows them light to dark
  within each family.
- **FU-3** Basic shapes keep their exact size in cm and do not snap to squares. Custom shapes are
  painted on a 4 × 4 m drawing grid of **10 cm squares** (finer than the plan's 20 cm), with a
  palette of the FU-2 colours plus an eraser, Freehand and Rectangle tools, 10/20/50 cm brushes
  and Undo. The size in cm shows as you paint.
  - A basic shape can be edited by drawing: the first stroke on it, or choosing Custom, turns it
    into squares of its colour, rounded to the nearest 10 cm (curves become stepped). Undo, or
    picking the basic shape again, brings it back. Pieces over 4 m can't be drawn on.
  - A custom piece's `colour` is its most-painted colour (a tie goes to the first painted, row by
    row). It stands for the piece wherever one colour is needed, such as bulk add.
- **FU-6** A piece can be copied: **Copy** opens a new piece pre-filled from the form, including
  unsaved edits, named "<name> copy" (shortened to fit the name limit).
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
  and a rotation in whole degrees, 0–359. Each piece is placed at most once per layout.
- **LA-3** Pieces with no placement in the current layout appear in a side tray. You drag a piece
  from the tray onto the plan to place it, and **Back to tray** removes it from the layout.
  Dragging a piece back onto the tray is out of scope: the tray uses HTML5 drag-and-drop and the
  plan uses pointer events, and joining the two isn't worth it.
- **LA-4** Dragging snaps to 10 cm (half a square). A piece turns about its centre to any whole
  angle, 0–359° clockwise: typed into the inspector, or stepped 10° at a time with − / +.
  **Horizontal** (**R**) lays the piece's long side left to right and **Vertical** (**Shift+R**)
  top to bottom; each picks whichever of its two angles is nearer the current one, so the piece
  keeps facing the same way. The wall and outside checks (LA-5) use the turned piece's bounding
  box.
- **LA-5** The selected piece shows its name and its size in cm. A piece that overlaps a wall or
  covers an empty square gets a warning outline, but the move is still allowed. Pieces may
  overlap each other without a warning, since some furniture does (a chair under a table, a rug
  under a sofa). A piece's centre must stay on the plan, and shrinking the plan removes pieces
  left off it.

### Sharing

- **SH-1** Membership (revised in Story 1.5):
  - The owner can add a dock user, which adds the apartment to that user's list and leaves their
    other apartments alone. This is refused for an unknown user, an existing member, or a user
    already at the AP-6 limit.
  - Members can leave, and land on another of their apartments.
  - The owner can remove members, and cannot leave; they delete the apartment instead (AP-5).
  - Every member can edit everything.

### Non-functional

- **NFR-a** There is no live push. Coarse plan writes (the drawn plan) send the
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
memberships.json                 { username: [apartment_id, ...] }
```

Before Story 1.5 the map was `{ username: apartment_id }`; that shape still reads, as a one-item
list, and is rewritten on the next membership change.

### `ApartmentDoc`

```
id, owner, name, updated_at, rev, plan_rev
cols: int, rows: int             grid size in 20 cm squares
surface: list[str]               rows strings, one token per square (see Encoding)
feature: list[str]
labels: list[{id, text, col, row}]
doors: list[{col, row, into, hinge, double}]   door setups (FP-10), keyed by anchor
furniture: list[Furniture]
layouts: list[Layout]            display order
```

`Furniture` = `{id, name, colour, note, shape, width_cm, depth_cm, cells: list[str] | None}`.
`cells` is only used by `custom` shapes: equal-length rows, at most 40 × 40, one character per
10 cm square. `.` is unpainted and each colour has a letter: white `w`, black `k`, grey `g`,
beige `e`, brown `b`, red `r`, orange `o`, yellow `y`, green `n`, blue `u`, purple `p`, tan `t`, pink `i`, navy `a`, teal `l`, olive `v`, charcoal `c`. Masks
saved before squares had colours (20 cm squares of `#` and `.`) are upgraded when read, each `#`
becoming 2 × 2 squares of the piece's colour, so their size is unchanged.

`Layout` = `{id, name, placements: list[{furniture_id, x_cm, y_cm, rotation}]}`.

A door setup's anchor (`col`, `row`) is the door's first square in reading order. `into` 0 opens
towards the side above a door in a horizontal wall, or left of one in a vertical wall; 1 below or
right. `hinge` 0 is the left or top end, 1 the right or bottom; a double door ignores it. A plan
write drops setups whose anchor is not a door square, and refuses two on the same square.

### Encoding

Each grid row is a string of fixed-width two-character codes. For example, `..` is empty, `t0`
is white tile and `w1` is medium wood. One `codes.ts` / `Literal` table on each side maps codes
to brush values. A 50 × 40 plan is then about 8 KB, and a diff of the JSON file stays readable.

## Backend

These modules mirror `iss_vanguard_*` and use the same names where possible:

- `app/schemas/floor_planner.py`
- `app/repositories/floor_planner_repo.py`: `read_apartment`, `write_apartment` (an atomic
  write), `apartment_transaction`, `new_apartment_id`, `delete_apartment`, `membership_lock`,
  `read_memberships`, `write_memberships`. The lock is always taken on membership first and then
  on the apartment.
- `app/services/floor_planner_service.py`: raises `FileNotFoundError`, `ValueError`, and a
  `StaleRevError` for NFR-a. It refuses invalid writes, such as a placement whose
  centre is off the plan, with `ValueError`.
- `app/routers/floor_planner.py`, prefix `/api/floor-planner`. It maps `FileNotFoundError` to
  404, `ValueError` to 422 and `StaleRevError` to 409. Every write takes `base_rev` and returns
  the full `ApartmentView`.

Since Story 1.5 every apartment route sits under `/apartments/{apartment_id}` (shortened to `…`
below). A caller who isn't a member gets 404, the same as for a missing apartment.

| Method & path | Does |
|---|---|
| `GET /apartments` | The caller's apartment list (AP-1, FP-1) |
| `POST /apartments` | AP-2 |
| `GET …` | One apartment |
| `PUT …/name` | AP-4 |
| `POST …/duplicate` | AP-3 |
| `DELETE …` | AP-5; returns the caller's remaining list |
| `PUT …/plan` | Replaces the grid, labels, door setups and size (FP-2 to FP-6, FP-10). Sent on save. |
| `POST …/furniture` | Adds one or more pieces (FU-1, FU-4) |
| `PUT` / `DELETE …/furniture/{id}` | FU-5 |
| `POST …/layouts`, `PUT` / `DELETE …/layouts/{id}` | LA-1 |
| `POST …/layouts/{id}/duplicate` | LA-1 |
| `PUT …/layouts/{id}/placements/{furniture_id}` | Places or moves a piece (LA-2) |
| `DELETE …/layouts/{id}/placements/{furniture_id}` | Returns a piece to the tray (LA-3) |
| `POST …/members`, `DELETE …/members/{username}` | SH-1 (the owner adds or removes) |
| `POST …/leave` | SH-1; returns the caller's remaining list |

Each piece and placement has its own endpoint, so two people arranging different pieces rarely
collide. Plan painting is the only coarse write. It is sent when drawing pauses (FP-9), when you
press **Save**, or when you leave Draw plan, not on every stroke.

## Frontend (`src/apps/floor-planner/`)

- **Rendering:** one SVG whose `viewBox` is measured in cm. Scale is preserved automatically, and
  zoom and pan are a transform on top. Surface squares are drawn as merged horizontal runs so
  that a 2,000-square plan stays light. Rulers are marked every metre, and the legend reads
  "1 square = 20 cm".
- **Units:**
  - `codes.ts`: brush, colour and shape vocabularies.
  - `grid.ts`: pure helpers to encode and decode, paint, fill rectangles and resize.
  - `furnitureFormat.ts`: the FU-4 parser.
  - `geometry.ts`: rotated bounding boxes, the snap rule and the LA-5 wall and outside checks.
- **Store:** `stores/useFloorPlanStore.ts` uses Pinia and exposes `apartment`, `loading` and
  `error`. All calls go through `useApi`.
- **Pages and components:**
  - `PlanPage` has three modes: Draw plan, Furniture and Arrange, each
    with a layout picker.
  - `BrushPalette`
  - `FurnitureList`
  - `BulkAddDialog`
  - `PieceStage` (the Furniture-mode drawing grid)
  - `LayoutTray`
  - `MembersDialog`
- Tests: the pure units (`grid`, `furnitureFormat`, `geometry`) and the store have spec files
  next to them. On the backend, `tests/test_floor_planner_*.py` covers the stale-rev check, membership and cascade deletes.

## UI — design B, "Drafting table"

Chosen from two mockups on 2026-10-08:
https://claude.ai/artifact/1nK3cQ36cNrwLq4GeTg8BV (the B artboards).

- **Light ground**, IBM Plex Sans with IBM Plex Mono for every measurement, and a blueprint blue
  accent (`#1d4ed8`). Like KitchenCraft, it needs a light shell header variant
  (`app-bar--floor-planner`) so the dark dock bar does not sit on top of it.
- **Top bar:** the apartment switcher (AP-1), a Draw plan · Furniture · Arrange switch, and member avatars.
- **Three columns:** a left panel, the centre, and a right panel. What each shows depends on the
  mode:

  | Mode | Left panel | Centre | Right panel |
  |---|---|---|---|
  | Draw plan | Structure brushes, floor brushes with inline colour chips, Eraser and Room label, the Freehand/Rectangle switch, Undo/Redo | The plan | Plan details, folded by default into a "Plan details" strip on the right edge (a click opens it; **Hide** folds it, and the browser remembers): a scale card ("1 square = 20 cm" with a 1 m scale bar), plan size and resize, the room label list |
  | Furniture | The furniture list | The open piece on the 10 cm drawing grid with its tools (FU-3); the plan is not shown | The piece form with Delete, Copy, Cancel and Save. **Bulk add** opens a dialog. |
  | Arrange | The tray of pieces not in this layout, then the pieces already on the plan | The plan with the layout's pieces | The selected piece: size, position in m, Vertical / Horizontal, the rotation in degrees with − / +, warnings, Back to tray |

- **Bottom bar:**
  - In Arrange, the layouts appear as tabs, followed by "+ New layout" and "Duplicate".
  - In every mode it ends with a status readout: the cursor position in metres, the size of the
    shape being drawn, and the zoom level. While drawing it also shows Saving… / Saved / Unsaved,
    with **Save now** while unsaved (FP-9).
- **Plan view:** rulers in metres on the top and left edges, thin lines every square and darker
  lines every metre (as on Roll20), room labels in small capitals, and a dark readout chip next to
  the shape being drawn. The grid lines cross the floors only while the plan is being painted;
  otherwise they show in empty space only, so a finished plan reads as rooms rather than squares.
- **Floors** are drawn to read as real flooring without competing with walls and furniture:
  wood as rows of 20 cm boards, 90–210 cm long, each a slightly different tone, laid as a
  6 × 2 m repeat; tiles as 60 cm squares. Joints and grout are faint (10 % black on light
  floors, 16 % white on dark ones). Chosen as direction C of the floor texture study
  (2026-10-09): https://claude.ai/artifact/Fi7SygucPe2Agm4pt6ZyCM
- The Furniture mode was not mocked up. It follows the same three columns and styling.

## Suggested story split

1. Register the app, the apartment store and membership (FP-1, SH-1, NFR-a/b).
2. The grid editor: brushes, rectangle mode, readouts, undo, resize, labels and the lock (FP-2 to
   FP-8; the lock was later removed).
3. The furniture list: shapes, the custom shape editor and bulk add (FU-1 to FU-5).
4. Layouts: the tray, drag, snap, rotate, wall and outside warnings, and duplicating layouts (LA-1 to
   LA-5).
5. Several apartments per user and an autosaving drawing (AP-1 to AP-6, FP-9, SH-1 revised).
