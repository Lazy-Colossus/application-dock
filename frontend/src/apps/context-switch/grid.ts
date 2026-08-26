// Board grid helpers (Story 2.2). The grid is a *view* over the active todos:
// page size = columns * rows, and anything past the current page paginates —
// a smaller grid never hides a todo, it just adds pages.

import type { Grid } from "@/apps/context-switch/types";

// Mirrors the backend bounds in app/schemas/context_switch.py.
export const GRID_MIN = 1;
export const GRID_MAX = 12;

export const DEFAULT_GRID: Grid = { columns: 3, rows: 2 };

export function clampGridValue(value: number): number {
  if (!Number.isFinite(value)) return GRID_MIN;
  return Math.min(GRID_MAX, Math.max(GRID_MIN, Math.trunc(value)));
}

export function pageSize(grid: Grid): number {
  return clampGridValue(grid.columns) * clampGridValue(grid.rows);
}

/** Number of pages needed for `total` todos — always at least 1. */
export function pageCount(total: number, grid: Grid): number {
  return Math.max(1, Math.ceil(total / pageSize(grid)));
}

/** The slice of `items` shown on `page` (1-based). */
export function pageSlice<T>(items: T[], grid: Grid, page: number): T[] {
  const size = pageSize(grid);
  const start = (page - 1) * size;
  return items.slice(start, start + size);
}
