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
