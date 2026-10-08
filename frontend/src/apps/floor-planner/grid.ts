import { EMPTY, type Brush } from "./codes";
import type { Label } from "./types";

export const CELL_CM = 20;

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

/** Grows with empty squares on the right and bottom; shrinking crops, dropping labels outside. */
export function resize(grid: PlanGrid, cols: number, rows: number): PlanGrid {
  return {
    cols,
    rows,
    surface: resizeRows(grid.surface, cols, rows),
    feature: resizeRows(grid.feature, cols, rows),
    labels: grid.labels.filter((l) => l.col < cols && l.row < rows),
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

export function bounds(cells: Cell[]): { cols: number; rows: number } {
  if (cells.length === 0) return { cols: 0, rows: 0 };
  const cs = cells.map((c) => c.col);
  const rs = cells.map((c) => c.row);
  return {
    cols: Math.max(...cs) - Math.min(...cs) + 1,
    rows: Math.max(...rs) - Math.min(...rs) + 1,
  };
}

export const metres = (squares: number): string => (squares * 0.2).toFixed(2);

/** Metres → whole squares, rounding up. The inner round cancels float noise (8.8 m is 44, not 45). */
export const squaresFor = (m: number): number =>
  Math.ceil(Math.round(m * 500) / 100);

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
/** Screen pixels per cm at 100 % zoom: 16 px per square, as in the mockup. */
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

export const ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2];

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
