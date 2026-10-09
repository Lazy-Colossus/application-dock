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

export const SNAP_CM = 10;
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
