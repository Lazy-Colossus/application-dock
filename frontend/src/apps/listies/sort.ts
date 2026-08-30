// View-only sorting. Nothing here writes: the stored `order` stays
// authoritative, and a sort produces a display order of row ids.

import type { CellValue, Column, ColumnType, Row } from "@/apps/listies/types";

export type SortDirection = "asc" | "desc";

export interface SortSpec {
  columnId: string;
  direction: SortDirection;
}

const isEmpty = (value: CellValue): boolean =>
  value === null || value === undefined;

/**
 * Compare two cell values for their column's type.
 *
 * Empty always sorts last — in both directions — because "not filled in" is
 * not a small value, it is the absence of one. Callers must therefore apply
 * direction *around* this function, never by negating its empty handling.
 */
export function compareValues(
  a: CellValue,
  b: CellValue,
  type: ColumnType,
): number {
  if (isEmpty(a) && isEmpty(b)) return 0;
  if (isEmpty(a)) return 1;
  if (isEmpty(b)) return -1;

  if (type === "number") return Number(a) - Number(b);
  if (type === "date") return String(a).localeCompare(String(b));
  return String(a).localeCompare(String(b), undefined, {
    sensitivity: "base",
  });
}

/**
 * The display order of row ids for a sort.
 *
 * `rows` is taken in its current display order, so ties keep the arrangement
 * the user is already looking at. The input array is not mutated.
 */
export function sortRowIds(
  rows: Row[],
  column: Column,
  direction: SortDirection,
): string[] {
  const sign = direction === "desc" ? -1 : 1;
  return [...rows]
    .sort((a, b) => {
      const left = a.cells[column.id] ?? null;
      const right = b.cells[column.id] ?? null;
      // Empties stay last whichever way the rest is facing.
      if (isEmpty(left) || isEmpty(right)) {
        return compareValues(left, right, column.type);
      }
      return sign * compareValues(left, right, column.type);
    })
    .map((row) => row.id);
}
