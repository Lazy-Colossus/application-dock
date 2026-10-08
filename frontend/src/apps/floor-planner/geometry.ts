import { EMPTY } from "./codes";
import { CELL_CM, codeAt, type PlanGrid } from "./grid";
import type { Furniture, Placement } from "./types";

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
  const turned = at.rotation === 90 || at.rotation === 270;
  const w = turned ? piece.depth_cm : piece.width_cm;
  const h = turned ? piece.width_cm : piece.depth_cm;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
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

export type Warning =
  | { kind: "wall" }
  | { kind: "outside" }
  | { kind: "overlap"; name: string };

export interface Placed {
  piece: Furniture;
  placement: Placement;
}

// Pieces that only touch, or overlap by a rounding hair, shouldn't warn.
const TOUCH_CM = 1;

function overlap(a: Box, b: Box): boolean {
  const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return dx > TOUCH_CM && dy > TOUCH_CM;
}

/** LA-5, judged on the rotated bounding box. Warnings never block a move. */
export function warnings(
  target: Placed,
  plan: PlanGrid,
  others: Placed[],
): Warning[] {
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
  for (const other of others) {
    if (other.piece.id === target.piece.id) continue;
    if (overlap(box, bounds(other.piece, other.placement))) {
      out.push({ kind: "overlap", name: other.piece.name });
    }
  }
  return out;
}

export function warningText(w: Warning): string {
  if (w.kind === "wall") return "Overlaps a wall";
  if (w.kind === "outside") return "Outside the apartment";
  return `Overlaps ${w.name}`;
}
