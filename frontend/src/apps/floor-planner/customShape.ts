import { CELL_CM, type Cell } from "./grid";

/** An n × n editing grid of `.`; a stored mask is the trimmed form of one. */
export function emptyMask(n: number): string[] {
  return Array.from({ length: n }, () => ".".repeat(n));
}

export function toggle(mask: string[], cell: Cell, on: boolean): string[] {
  return mask.map((row, r) =>
    r === cell.row
      ? row.slice(0, cell.col) + (on ? "#" : ".") + row.slice(cell.col + 1)
      : row,
  );
}

/** Drops empty edge rows and columns; nothing painted gives []. */
export function trim(mask: string[]): string[] {
  const rows = mask
    .map((r, i) => (r.includes("#") ? i : -1))
    .filter((i) => i >= 0);
  if (rows.length === 0) return [];
  const cols = [...mask[0]]
    .map((_, c) => (mask.some((r) => r[c] === "#") ? c : -1))
    .filter((c) => c >= 0);
  return mask
    .slice(rows[0], rows[rows.length - 1] + 1)
    .map((r) => r.slice(cols[0], cols[cols.length - 1] + 1));
}

/** Centres a stored mask in the n × n editor so it can be painted on again. */
export function pad(mask: string[], n: number): string[] {
  const grid = emptyMask(n);
  if (mask.length === 0) return grid;
  const top = Math.floor((n - mask.length) / 2);
  const left = Math.floor((n - mask[0].length) / 2);
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
  return { cols, rows, widthCm: cols * CELL_CM, depthCm: rows * CELL_CM };
}
