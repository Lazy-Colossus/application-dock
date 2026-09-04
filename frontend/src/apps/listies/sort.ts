// View-only sorting. Nothing here writes: the stored `order` stays
// authoritative, and a sort produces a display order of row ids.

import { isPlace } from "@/apps/listies/types";
import type {
  CellValue,
  Column,
  ColumnType,
  PlaceGroup,
  Row,
} from "@/apps/listies/types";

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
  groups?: PlaceGroup[],
): number {
  if (isEmpty(a) && isEmpty(b)) return 0;
  if (isEmpty(a)) return 1;
  if (isEmpty(b)) return -1;

  if (type === "number") return Number(a) - Number(b);
  if (type === "date") return String(a).localeCompare(String(b));
  // A group sorts by its resolved name, through the same text comparator; a
  // dangling id resolves to "" and sorts as an empty name (Story 4.6).
  if (type === "place_group") {
    const left = groupName(a, groups);
    const right = groupName(b, groups);
    return left.localeCompare(right, undefined, { sensitivity: "base" });
  }
  // A place sorts by its name, through the same text comparator.
  const left = isPlace(a) ? a.name : String(a);
  const right = isPlace(b) ? b.name : String(b);
  return left.localeCompare(right, undefined, { sensitivity: "base" });
}

function groupName(id: CellValue, groups: PlaceGroup[] | undefined): string {
  if (typeof id !== "string") return "";
  return groups?.find((group) => group.id === id)?.name ?? "";
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
  groups?: PlaceGroup[],
): string[] {
  const sign = direction === "desc" ? -1 : 1;
  return [...rows]
    .sort((a, b) => {
      const left = a.cells[column.id] ?? null;
      const right = b.cells[column.id] ?? null;
      // Empties stay last whichever way the rest is facing.
      if (isEmpty(left) || isEmpty(right)) {
        return compareValues(left, right, column.type, groups);
      }
      return sign * compareValues(left, right, column.type, groups);
    })
    .map((row) => row.id);
}
