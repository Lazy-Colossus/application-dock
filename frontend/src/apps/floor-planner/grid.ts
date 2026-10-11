import { EMPTY, type Brush } from "./codes";
import type { DoorSetting, Label } from "./types";

export const CELL_CM = 5;

export interface Cell {
  col: number;
  row: number;
}

export interface PlanGrid {
  cols: number;
  rows: number;
  surface: string[];
  feature: string[];
  labels: Label[];
  doors: DoorSetting[];
}

export interface Run {
  row: number;
  col: number;
  len: number;
  code: string;
}

export function emptyRows(cols: number, rows: number): string[] {
  return Array.from({ length: rows }, () => EMPTY.repeat(cols));
}

export function codeAt(rows: string[], cell: Cell): string {
  return rows[cell.row]?.slice(cell.col * 2, cell.col * 2 + 2) ?? EMPTY;
}

/** Bresenham: every square from a to b inclusive, so fast drags leave no gaps. */
export function lineCells(a: Cell, b: Cell): Cell[] {
  const cells: Cell[] = [];
  const dc = Math.abs(b.col - a.col);
  const dr = -Math.abs(b.row - a.row);
  const sc = a.col < b.col ? 1 : -1;
  const sr = a.row < b.row ? 1 : -1;
  let err = dc + dr;
  let { col, row } = a;
  for (;;) {
    cells.push({ col, row });
    if (col === b.col && row === b.row) return cells;
    const e2 = 2 * err;
    if (e2 >= dr) {
      err += dr;
      col += sc;
    }
    if (e2 <= dc) {
      err += dc;
      row += sr;
    }
  }
}

export const BRUSH_SIZES = [1, 2, 5] as const;
export type BrushSize = (typeof BRUSH_SIZES)[number];

/** Plan brushes in squares: 5, 10, 20 and 50 cm. */
export const PLAN_BRUSH_SIZES = [1, 2, 4, 10] as const;
export type PlanBrushSize = (typeof PLAN_BRUSH_SIZES)[number];

/** An n×n square per cell, centred on odd sizes and growing right/down on even ones, clipped to the plan. */
export function stampCells(
  cells: Cell[],
  size: number,
  cols: number,
  rows: number,
): Cell[] {
  if (size === 1) return cells;
  const offset = Math.floor((size - 1) / 2);
  const out: Cell[] = [];
  for (const c of cells) {
    for (let row = c.row - offset; row < c.row - offset + size; row++) {
      for (let col = c.col - offset; col < c.col - offset + size; col++) {
        if (col >= 0 && col < cols && row >= 0 && row < rows)
          out.push({ col, row });
      }
    }
  }
  return uniqueCells(out);
}

export function rectCells(a: Cell, b: Cell): Cell[] {
  const cells: Cell[] = [];
  for (let row = Math.min(a.row, b.row); row <= Math.max(a.row, b.row); row++) {
    for (
      let col = Math.min(a.col, b.col);
      col <= Math.max(a.col, b.col);
      col++
    ) {
      cells.push({ col, row });
    }
  }
  return cells;
}

function setCells(rows: string[], cells: Cell[], code: string): string[] {
  const grid = rows.map((line) => line.match(/.{2}/g) ?? []);
  for (const { col, row } of cells) grid[row][col] = code;
  return grid.map((tokens) => tokens.join(""));
}

/** A floor brush writes the surface, a structure brush the feature layer, the eraser both. */
export function paint(grid: PlanGrid, cells: Cell[], brush: Brush): PlanGrid {
  const inside = cells.filter(
    (c) => c.col >= 0 && c.col < grid.cols && c.row >= 0 && c.row < grid.rows,
  );
  if (brush.layer === null || inside.length === 0) return grid;
  return {
    ...grid,
    surface:
      brush.layer === "feature"
        ? grid.surface
        : setCells(
            grid.surface,
            inside,
            brush.layer === "both" ? EMPTY : brush.code,
          ),
    feature:
      brush.layer === "surface"
        ? grid.feature
        : setCells(
            grid.feature,
            inside,
            brush.layer === "both" ? EMPTY : brush.code,
          ),
  };
}

function resizeRows(rows: string[], cols: number, count: number): string[] {
  return Array.from({ length: count }, (_, r) =>
    (rows[r] ?? "").slice(0, cols * 2).padEnd(cols * 2, "."),
  );
}

/** Grows with empty squares on the right and bottom; shrinking crops, dropping labels and door setups outside. */
export function resize(grid: PlanGrid, cols: number, rows: number): PlanGrid {
  const inside = (c: { col: number; row: number }) =>
    c.col < cols && c.row < rows;
  return {
    cols,
    rows,
    surface: resizeRows(grid.surface, cols, rows),
    feature: resizeRows(grid.feature, cols, rows),
    labels: grid.labels.filter(inside),
    doors: grid.doors.filter(inside),
  };
}

export function labelsOutside(
  grid: PlanGrid,
  cols: number,
  rows: number,
): number {
  return grid.labels.filter((l) => l.col >= cols || l.row >= rows).length;
}

/** Same-code horizontal runs per row, empties skipped — what the canvas draws. */
export function runs(rows: string[]): Run[] {
  const out: Run[] = [];
  rows.forEach((line, row) => {
    const tokens = line.match(/.{2}/g) ?? [];
    let start = 0;
    for (let col = 1; col <= tokens.length; col++) {
      if (col === tokens.length || tokens[col] !== tokens[start]) {
        if (tokens[start] !== EMPTY) {
          out.push({ row, col: start, len: col - start, code: tokens[start] });
        }
        start = col;
      }
    }
  });
  return out;
}

/** A loop, not Math.min(...): a 15 m rectangle is 90,000 squares, too many to spread as arguments. */
export function bounds(cells: Cell[]): {
  col: number;
  row: number;
  cols: number;
  rows: number;
} {
  if (cells.length === 0) return { col: 0, row: 0, cols: 0, rows: 0 };
  let [c0, c1, r0, r1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const { col, row } of cells) {
    c0 = Math.min(c0, col);
    c1 = Math.max(c1, col);
    r0 = Math.min(r0, row);
    r1 = Math.max(r1, row);
  }
  return { col: c0, row: r0, cols: c1 - c0 + 1, rows: r1 - r0 + 1 };
}

/** Horizontal runs of the given squares, so a stroke preview draws one rect per run, not per square. */
export function cellRuns(cells: Cell[]): Omit<Run, "code">[] {
  const sorted = [...cells].sort((a, b) => a.row - b.row || a.col - b.col);
  const out: Omit<Run, "code">[] = [];
  for (const { col, row } of sorted) {
    const prev = out[out.length - 1];
    if (prev && prev.row === row && prev.col + prev.len === col) prev.len++;
    else out.push({ row, col, len: 1 });
  }
  return out;
}

export const metres = (squares: number): string =>
  ((squares * CELL_CM) / 100).toFixed(2);

/** Metres → whole squares, rounding up. The inner round cancels float noise (8.8 m is 176, not 177). */
export const squaresFor = (m: number): number =>
  Math.ceil(Math.round((m * 10000) / CELL_CM) / 100);

/** "Wall · 3.40 m" for a one-square-wide stroke, otherwise "Tile · 1.60 × 2.60 m". */
export function readout(cells: Cell[], brushLabel: string): string {
  const { cols, rows } = bounds(cells);
  const size =
    cols === 1 || rows === 1
      ? `${metres(Math.max(cols, rows))} m`
      : `${metres(cols)} × ${metres(rows)} m`;
  return `${brushLabel} · ${size}`;
}

export function uniqueCells(cells: Cell[]): Cell[] {
  const seen = new Set<string>();
  return cells.filter((c) => {
    const key = `${c.col},${c.row}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Ruler band width around the plan, in cm. */
export const RULER_CM = 40;
/** Screen pixels per cm at 100 % zoom: 80 px per metre, as in the mockup. */
export const PX_PER_CM = 0.8;
/** Label text height on screen, kept constant across zoom levels. */
export const LABEL_PX = 11;

/** The square under a screen point, or null outside the plan. Zoom never touches stored cm. */
export function cellAt(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number },
  zoom: number,
  cols: number,
  rows: number,
): Cell | null {
  const scale = PX_PER_CM * zoom;
  const col = Math.floor(((clientX - rect.left) / scale - RULER_CM) / CELL_CM);
  const row = Math.floor(((clientY - rect.top) / scale - RULER_CM) / CELL_CM);
  if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
  return { col, row };
}

/** The label drawn over a square, judged by its approximate on-screen text width. */
export function labelAtCell(
  labels: Label[],
  cell: Cell,
  zoom: number,
): Label | null {
  const charCm = (LABEL_PX * 0.62) / (PX_PER_CM * zoom);
  return (
    labels.find((l) => {
      const span = Math.max(
        1,
        Math.ceil((l.text.length * charCm + 8) / CELL_CM),
      );
      return cell.row === l.row && cell.col >= l.col && cell.col < l.col + span;
    }) ?? null
  );
}

// The top levels exist so single 5 cm squares are big enough to hit.
export const ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2, 3, 4];

/** The finest grid spacing, in cm, whose lines stay at least this far apart on screen. */
const GRID_MIN_PX = 8;
export function minorGridCm(zoom: number): number {
  return CELL_CM * PX_PER_CM * zoom >= GRID_MIN_PX ? CELL_CM : 20;
}

/** The unclamped plan position under a screen point, in cm. */
export function cmAt(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number },
  zoom: number,
): { x: number; y: number } {
  const scale = PX_PER_CM * zoom;
  return {
    x: (clientX - rect.left) / scale - RULER_CM,
    y: (clientY - rect.top) / scale - RULER_CM,
  };
}
