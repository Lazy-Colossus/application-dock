import {
  COLOUR_CHARS,
  CUSTOM_MAX,
  EMPTY_SQUARE,
  PIECE_CELL_CM,
  SIDE_CM_MAX,
  mainColour,
  type PieceDraft,
} from "./furniture";
import type { Cell } from "./grid";
import type { Shape } from "./types";

/** An n × n editing grid of empty squares; a stored mask is the trimmed form of one. */
export function emptyMask(n: number): string[] {
  return Array.from({ length: n }, () => EMPTY_SQUARE.repeat(n));
}

/** Sets every square in `cells` to `ch`, ignoring any outside the mask. */
export function paintSquares(
  mask: string[],
  cells: Cell[],
  ch: string,
): string[] {
  const grid = mask.map((row) => [...row]);
  for (const { col, row } of cells) {
    if (grid[row]?.[col] !== undefined) grid[row][col] = ch;
  }
  return grid.map((row) => row.join(""));
}

/** Drops empty edge rows and columns; nothing painted gives []. */
export function trim(mask: string[]): string[] {
  const on = (ch: string) => ch !== EMPTY_SQUARE;
  const rows = mask
    .map((r, i) => ([...r].some(on) ? i : -1))
    .filter((i) => i >= 0);
  if (rows.length === 0) return [];
  const cols = [...mask[0]]
    .map((_, c) => (mask.some((r) => on(r[c])) ? c : -1))
    .filter((c) => c >= 0);
  return mask
    .slice(rows[0], rows[rows.length - 1] + 1)
    .map((r) => r.slice(cols[0], cols[cols.length - 1] + 1));
}

/** Where a cols × rows mask sits when centred in the n × n editor. */
export function padOffset(
  cols: number,
  rows: number,
  n: number,
): { left: number; top: number } {
  return { left: Math.floor((n - cols) / 2), top: Math.floor((n - rows) / 2) };
}

/** Centres a stored mask in the n × n editor so it can be painted on again. */
export function pad(mask: string[], n: number): string[] {
  const grid = emptyMask(n);
  if (mask.length === 0) return grid;
  const { left, top } = padOffset(mask[0].length, mask.length, n);
  return grid.map((row, r) => {
    const src = mask[r - top];
    return src === undefined
      ? row
      : row.slice(0, left) + src + row.slice(left + src.length);
  });
}

export function maskSize(mask: string[]): {
  cols: number;
  rows: number;
  widthCm: number;
  depthCm: number;
} {
  const cols = mask[0]?.length ?? 0;
  const rows = mask.length;
  return {
    cols,
    rows,
    widthCm: cols * PIECE_CELL_CM,
    depthCm: rows * PIECE_CELL_CM,
  };
}

/** Squares across and down a typed size takes once drawn, to the nearest square. */
export function squaresFor(
  widthCm: number,
  depthCm: number,
): {
  cols: number;
  rows: number;
} {
  const n = (cm: number) => Math.max(1, Math.round(cm / PIECE_CELL_CM));
  return { cols: n(widthCm), rows: n(depthCm) };
}

/** Whether a point (0–1 across, 0–1 down the box) lies inside the shape. */
function inside(
  shape: Exclude<Shape, "custom">,
  u: number,
  v: number,
): boolean {
  const x = (u - 0.5) / 0.5;
  switch (shape) {
    case "rectangle":
      return true;
    case "round":
    case "oval":
      return x * x + ((v - 0.5) / 0.5) ** 2 <= 1;
    case "egg": {
      // Widest at 42 % of the depth, matching `outline`.
      const y = v < 0.42 ? (v - 0.42) / 0.42 : (v - 0.42) / 0.58;
      return x * x + y * y <= 1;
    }
  }
}

/** A typed shape fits the drawing grid when its sides are valid and at most 4 m. */
export function canDraw(d: PieceDraft): boolean {
  const ok = (cm: number) =>
    Number.isInteger(cm) &&
    cm >= 1 &&
    cm <= Math.min(SIDE_CM_MAX, CUSTOM_MAX * PIECE_CELL_CM);
  return d.shape === "custom" || (ok(d.width_cm) && ok(d.depth_cm));
}

/** A typed shape as squares in its colour, so it can be painted over. */
export function toDrawn(d: PieceDraft): PieceDraft {
  if (d.shape === "custom") return d;
  const shape = d.shape;
  const { cols, rows } = squaresFor(d.width_cm, d.depth_cm);
  const ch = COLOUR_CHARS[d.colour];
  const cells = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) =>
      inside(shape, (c + 0.5) / cols, (r + 0.5) / rows) ? ch : EMPTY_SQUARE,
    ).join(""),
  );
  return withCells({ ...d, shape: "custom" }, cells);
}

/** The draft after painting: trimmed squares, the size they cover, and their main colour. */
export function withCells(d: PieceDraft, mask: string[]): PieceDraft {
  const cells = trim(mask);
  const { widthCm, depthCm } = maskSize(cells);
  return {
    ...d,
    cells,
    width_cm: widthCm,
    depth_cm: depthCm,
    colour: mainColour(cells, d.colour),
  };
}
