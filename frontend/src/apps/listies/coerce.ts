// Display formatting for cell values. Pure functions — no Vue, no store — so
// the fiddly per-type rules are unit-tested without mounting a grid.

import { isPlace } from "@/apps/listies/types";
import type {
  CellValue,
  ColumnType,
  PlaceGroup,
  Row,
} from "@/apps/listies/types";

// An unfilled cell reads as a muted dash rather than blank space, so an empty
// cell is visibly empty rather than ambiguous.
export const EMPTY_DISPLAY = "—";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const GLYPHS: Record<ColumnType, string> = {
  text: "Aa",
  number: "#",
  date: "▤",
  place: "📍",
  place_group: "◈",
};

/** Resolve a group id to its group, or `undefined` for a dangling/absent id. */
export function findGroup(
  id: CellValue,
  groups: PlaceGroup[] | undefined,
): PlaceGroup | undefined {
  if (typeof id !== "string") return undefined;
  return groups?.find((group) => group.id === id);
}

/** "2026-09-02" → "02 Sep 26". A malformed value is passed through untouched. */
function formatDate(value: string): string {
  const match = ISO_DATE.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) return value;
  return `${day} ${monthName} ${year!.slice(2)}`;
}

export function formatCell(
  value: CellValue,
  type: ColumnType,
  groups?: PlaceGroup[],
): string {
  if (value === null || value === undefined) return EMPTY_DISPLAY;
  // A group cell holds an id; it shows the group's name, and a dangling id
  // (group deleted out from under it) reads as ungrouped — the muted dash.
  if (type === "place_group") {
    return findGroup(value, groups)?.name ?? EMPTY_DISPLAY;
  }
  // A place is an object: `String(place)` would print "[object Object]".
  if (isPlace(value)) return value.name;
  if (type === "date" && typeof value === "string") return formatDate(value);
  return String(value);
}

/** The muted second line of a place cell. */
export function placeAddress(value: CellValue): string {
  return isPlace(value) ? value.address : "";
}

export function typeGlyph(type: ColumnType): string {
  return GLYPHS[type];
}

export type ParseResult =
  | { ok: true; value: CellValue }
  | { ok: false; error: string };

/** Is this a real calendar date, not just ISO-shaped? (2026-02-31 is not.) */
function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Validate what the user typed against the column's type.
 *
 * The server is the authority (it re-validates every write); this exists so
 * the user finds out immediately rather than after a round trip. An empty
 * entry always means "clear the cell" — never 0 and never "".
 */
export function parseCell(input: string, type: ColumnType): ParseResult {
  if (!input.trim()) return { ok: true, value: null };

  // A place is chosen from search results (Story 4.3), never typed in.
  if (type === "place") {
    return { ok: false, error: "Pick a place from the search results" };
  }

  // A group is chosen from the dropdown (Story 4.6), never typed in.
  if (type === "place_group") {
    return { ok: false, error: "Pick a group" };
  }

  if (type === "text") return { ok: true, value: input };

  if (type === "number") {
    // Number("") is 0 and Number(" ") is 0, but both are handled above.
    const value = Number(input);
    if (!Number.isFinite(value)) {
      return { ok: false, error: "Enter a number" };
    }
    return { ok: true, value };
  }

  const match = ISO_DATE.exec(input.trim());
  if (
    !match ||
    !isRealDate(Number(match[1]), Number(match[2]), Number(match[3]))
  ) {
    return { ok: false, error: "Enter a date as YYYY-MM-DD" };
  }
  return { ok: true, value: input.trim() };
}

/**
 * How many filled cells a retype would empty.
 *
 * Used to warn before applying a destructive type change. It mirrors the
 * server's re-coercion rules; the server remains the authority, this is only
 * how the user finds out what it will cost.
 */
export function countBlankedByRetype(
  rows: Row[],
  columnId: string,
  newType: ColumnType,
  fromType?: ColumnType,
  groups?: PlaceGroup[],
): number {
  return rows.filter((row) => {
    const value = row.cells[columnId];
    if (value === null || value === undefined) return false;
    // Leaving a group: only text survives (carrying the group's name), and a
    // dangling id blanks even then; everything else blanks (Story 4.6).
    if (fromType === "place_group") {
      if (newType === "text") return findGroup(value, groups) === undefined;
      return true;
    }
    // A group id cannot be reconstructed from a scalar or a place.
    if (newType === "place_group") return true;
    // A place survives only as text (its name) or as a place.
    if (isPlace(value)) return newType !== "text" && newType !== "place";
    // A scalar can never become a place.
    if (newType === "place") return true;
    return !parseCell(String(value), newType).ok;
  }).length;
}
