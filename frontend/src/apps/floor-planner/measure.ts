import { EMPTY, STRUCTURE } from "./codes";
import { codeAt, metres, type Cell, type PlanGrid } from "./grid";

/** Open floor: no feature on it, and inside the apartment. */
const FLOOR = "fl";

/** A straight run of squares, along a row (`h`) or a column (`v`). */
export interface Span {
  col: number;
  row: number;
  len: number;
}

/**
 * Every square's horizontal and vertical run of the same thing: one feature code (so a door
 * ends a wall run), open floor, or nothing. Built once per plan change, so hovering is a lookup.
 */
export interface RunIndex {
  cols: number;
  kinds: (string | null)[];
  /** Run id per square, row-major; -1 where there is nothing to measure. */
  h: Int32Array;
  v: Int32Array;
  hRuns: Span[];
  vRuns: Span[];
}

function kindAt(plan: PlanGrid, cell: Cell): string | null {
  const feature = codeAt(plan.feature, cell);
  if (feature !== EMPTY) return feature;
  return codeAt(plan.surface, cell) === EMPTY ? null : FLOOR;
}

export function buildRunIndex(plan: PlanGrid): RunIndex {
  const { cols, rows } = plan;
  const kinds: (string | null)[] = new Array(cols * rows);
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++)
      kinds[row * cols + col] = kindAt(plan, { col, row });

  const h = new Int32Array(cols * rows).fill(-1);
  const hRuns: Span[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; ) {
      const kind = kinds[row * cols + col];
      let end = col + 1;
      while (end < cols && kinds[row * cols + end] === kind) end++;
      if (kind !== null) {
        for (let c = col; c < end; c++) h[row * cols + c] = hRuns.length;
        hRuns.push({ col, row, len: end - col });
      }
      col = end;
    }
  }

  const v = new Int32Array(cols * rows).fill(-1);
  const vRuns: Span[] = [];
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; ) {
      const kind = kinds[row * cols + col];
      let end = row + 1;
      while (end < rows && kinds[end * cols + col] === kind) end++;
      if (kind !== null) {
        for (let r = row; r < end; r++) v[r * cols + col] = vRuns.length;
        vRuns.push({ col, row, len: end - row });
      }
      row = end;
    }
  }
  return { cols, kinds, h, v, hRuns, vRuns };
}

export type Measure =
  /** A wall, window or door: the run along its length, whichever way is longer. */
  | { kind: "feature"; code: string; dir: "h" | "v"; span: Span }
  /** Open floor: the clear span to the walls (or the apartment's edge) both ways. */
  | { kind: "floor"; h: Span; v: Span };

export function measureAt(index: RunIndex, cell: Cell): Measure | null {
  const i = cell.row * index.cols + cell.col;
  const kind = index.kinds[i];
  if (kind === null || kind === undefined) return null;
  const h = index.hRuns[index.h[i]];
  const v = index.vRuns[index.v[i]];
  if (kind === FLOOR) return { kind: "floor", h, v };
  return h.len >= v.len
    ? { kind: "feature", code: kind, dir: "h", span: h }
    : { kind: "feature", code: kind, dir: "v", span: v };
}

/** "Wall · 3.40 m", or "Clear 2.85 × 3.60 m" across open floor. */
export function measureText(m: Measure): string {
  if (m.kind === "floor")
    return `Clear ${metres(m.h.len)} × ${metres(m.v.len)} m`;
  const name = STRUCTURE.find((s) => s.code === m.code)?.label ?? m.code;
  return `${name} · ${metres(m.span.len)} m`;
}
