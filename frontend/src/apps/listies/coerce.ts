// Display formatting for cell values. Pure functions — no Vue, no store — so
// the fiddly per-type rules are unit-tested without mounting a grid.

import type { CellValue, ColumnType } from "@/apps/listies/types";

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
};

/** "2026-09-02" → "02 Sep 26". A malformed value is passed through untouched. */
function formatDate(value: string): string {
  const match = ISO_DATE.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) return value;
  return `${day} ${monthName} ${year!.slice(2)}`;
}

export function formatCell(value: CellValue, type: ColumnType): string {
  if (value === null || value === undefined) return EMPTY_DISPLAY;
  if (type === "date" && typeof value === "string") return formatDate(value);
  return String(value);
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
