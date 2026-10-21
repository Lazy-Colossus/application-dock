import { EMPTY } from "./codes";
import { CELL_CM, codeAt, type PlanGrid } from "./grid";
import type { Furniture, Placement, Rotation } from "./types";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Sized = Pick<Furniture, "width_cm" | "depth_cm">;
type Spot = Pick<Placement, "x_cm" | "y_cm" | "rotation">;

export const SNAP_CM = 5;
export const snap = (v: number): number =>
  Math.round(v / SNAP_CM) * SNAP_CM || 0;

/** The rotated bounding box. A piece turns about its centre, so the centre never moves. */
export function bounds(piece: Sized, at: Spot): Box {
  const cx = at.x_cm + piece.width_cm / 2;
  const cy = at.y_cm + piece.depth_cm / 2;
  const rad = (at.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  // Rounding drops float noise, so a quarter turn swaps the sides exactly.
  const r = (v: number) => Math.round(v * 1000) / 1000;
  const w = r(piece.width_cm * cos + piece.depth_cm * sin);
  const h = r(piece.width_cm * sin + piece.depth_cm * cos);
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** The − / + buttons turn a piece this many degrees. */
export const ROTATION_STEP = 10;

/** Any angle as whole degrees 0–359. */
export function normaliseRotation(deg: number): Rotation {
  return ((Math.round(deg) % 360) + 360) % 360;
}

/**
 * The angle that lays the piece's long side left to right (horizontal) or top to bottom
 * (vertical). Of the two that do, the one nearer the current angle, so the piece keeps facing
 * the same way.
 */
export function orient(
  piece: Sized,
  rotation: Rotation,
  to: "horizontal" | "vertical",
): Rotation {
  const wide = piece.width_cm >= piece.depth_cm;
  const base = (to === "horizontal") === wide ? 0 : 90;
  const away = (a: number) => {
    const d = Math.abs(normaliseRotation(rotation) - a) % 360;
    return Math.min(d, 360 - d);
  };
  return away(base) <= away(base + 180) ? base : base + 180;
}

export function centreInside(
  piece: Sized,
  x: number,
  y: number,
  plan: PlanGrid,
): boolean {
  const cx = x + piece.width_cm / 2;
  const cy = y + piece.depth_cm / 2;
  return (
    cx >= 0 && cy >= 0 && cx <= plan.cols * CELL_CM && cy <= plan.rows * CELL_CM
  );
}

/** The (unrotated, snapped) top-left that puts the piece's centre at a point. */
export function topLeftForCentre(
  piece: Sized,
  cx: number,
  cy: number,
): { x: number; y: number } {
  return { x: snap(cx - piece.width_cm / 2), y: snap(cy - piece.depth_cm / 2) };
}

/** How far a side may poke into a wall, or stop short of it by less than, and still be sat flush. */
export const WALL_SNAP_CM = SNAP_CM;

/** Walls and the windows set in them; a door is an opening, so nothing snaps into it. */
const SOLID = new Set(["wl", "wn"]);

/**
 * The shift along one axis that puts the box's low or high side flush with the nearest wall face
 * within reach, or 0. `solid(along, across)` reads a square with the axes swapped as needed. A face
 * only counts if it runs beside at least half of the box, so the end of a wall the piece pokes
 * into (beside a door, say) doesn't pull it sideways.
 */
function wallShift(
  lo: number,
  hi: number,
  across: number[],
  solid: (along: number, across: number) => boolean,
): number {
  const beside = (wall: number, room: number) => {
    // Solid both sides is a wall running the other way, say at a corner: it doesn't vote.
    const open = across.filter((a) => !(solid(wall, a) && solid(room, a)));
    const faced = open.filter((a) => solid(wall, a)).length;
    return faced > 0 && faced * 2 >= open.length;
  };
  let best: number | null = null;
  const consider = (shift: number) => {
    if (best === null || Math.abs(shift) < Math.abs(best)) best = shift;
  };
  const faces = (edge: number) => {
    const out: number[] = [];
    const first = Math.ceil((edge - WALL_SNAP_CM) / CELL_CM);
    const last = Math.floor((edge + WALL_SNAP_CM) / CELL_CM);
    for (let i = first; i <= last; i++) out.push(i);
    return out;
  };
  // Face i is the line between squares i - 1 and i. Whole cm, rounded away from the wall, so a
  // box on a half centimetre never ends up touching it.
  // A gap of a full WALL_SNAP_CM is left as the user placed it; only a smaller one is closed.
  // Poking into the wall by up to WALL_SNAP_CM is still pushed back out.
  for (const i of faces(lo)) {
    const shift = Math.ceil(i * CELL_CM - lo);
    if (beside(i - 1, i) && shift > -WALL_SNAP_CM) consider(shift);
  }
  for (const i of faces(hi)) {
    const shift = Math.floor(i * CELL_CM - hi);
    if (beside(i, i - 1) && shift < WALL_SNAP_CM) consider(shift);
  }
  return best ?? 0;
}

/**
 * The top-left that sits a piece flush against any wall face within WALL_SNAP_CM of its sides,
 * each axis on its own so a piece pushed into a corner meets both walls. Exact for quarter turns;
 * at other angles the rotated bounding box is what touches the wall.
 */
export function snapToWalls(
  piece: Sized,
  at: Spot,
  plan: PlanGrid,
): { x_cm: number; y_cm: number } {
  const solid = (col: number, row: number) =>
    SOLID.has(codeAt(plan.feature, { col, row }));
  const span = (from: number, to: number) => {
    const out: number[] = [];
    for (let i = Math.floor(from / CELL_CM); i < Math.ceil(to / CELL_CM); i++)
      out.push(i);
    return out;
  };
  const box = bounds(piece, at);
  const dy = wallShift(
    box.y,
    box.y + box.h,
    span(box.x, box.x + box.w),
    (r, c) => solid(c, r),
  );
  // Across, judged where the piece will sit once up or down is settled.
  const y = box.y + dy;
  const dx = wallShift(box.x, box.x + box.w, span(y, y + box.h), solid);
  return { x_cm: at.x_cm + dx, y_cm: at.y_cm + dy };
}

export type Warning = { kind: "wall" } | { kind: "outside" };

export interface Placed {
  piece: Furniture;
  placement: Placement;
}

/** LA-5, judged on the rotated bounding box. Pieces may overlap each other; warnings never block a move. */
export function warnings(target: Placed, plan: PlanGrid): Warning[] {
  const box = bounds(target.piece, target.placement);
  const out: Warning[] = [];
  const first = (v: number) => Math.floor(v / CELL_CM);
  const last = (v: number) => Math.ceil(v / CELL_CM) - 1;
  const c0 = first(box.x);
  const c1 = last(box.x + box.w);
  const r0 = first(box.y);
  const r1 = last(box.y + box.h);
  let wall = false;
  let outside = c0 < 0 || r0 < 0 || c1 >= plan.cols || r1 >= plan.rows;
  for (let row = Math.max(r0, 0); row <= Math.min(r1, plan.rows - 1); row++) {
    for (let col = Math.max(c0, 0); col <= Math.min(c1, plan.cols - 1); col++) {
      const feature = codeAt(plan.feature, { col, row });
      if (feature === "wl") wall = true;
      if (feature === EMPTY && codeAt(plan.surface, { col, row }) === EMPTY)
        outside = true;
    }
  }
  if (wall) out.push({ kind: "wall" });
  if (outside) out.push({ kind: "outside" });
  return out;
}

export function warningText(w: Warning): string {
  return w.kind === "wall" ? "Overlaps a wall" : "Outside the apartment";
}
