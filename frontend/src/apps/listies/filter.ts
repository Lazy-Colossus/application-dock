// View-only filtering. Nothing here writes: the stored `order`, `cells` and the
// document stay authoritative, and a filter produces a display list of row ids.
// Composes with sort.ts — filter decides *which* rows show, sort their order.

import { isPlace } from "@/apps/listies/types";
import type { CellValue, PlaceGroup, Row } from "@/apps/listies/types";

export type NumberOp = "eq" | "gt" | "lt" | "between";
export type DateOp = "on" | "before" | "after" | "between";

/**
 * One column's filter. `kind` mirrors the column type; a `null` in a
 * `place_group` filter's `groupIds` is the "Ungrouped" sentinel — a filter *for*
 * the absence of a group, which also catches a dangling id.
 */
export type FilterSpec =
  | { kind: "text"; contains: string }
  | { kind: "place"; contains: string }
  | { kind: "number"; op: NumberOp; value?: number; min?: number; max?: number }
  | { kind: "date"; op: DateOp; value?: string; min?: string; max?: string }
  | { kind: "place_group"; groupIds: (string | null)[] };

const hasNumber = (n: number | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n);

const hasText = (s: string | undefined): boolean => !!s && s.trim().length > 0;

/**
 * Does this spec actually narrow anything? An empty search term, a bound-less
 * number/date filter, or an empty group selection is inactive ("keep all").
 */
export function isActive(spec: FilterSpec): boolean {
  switch (spec.kind) {
    case "text":
    case "place":
      return hasText(spec.contains);
    case "number":
      return spec.op === "between"
        ? hasNumber(spec.min) || hasNumber(spec.max)
        : hasNumber(spec.value);
    case "date":
      return spec.op === "between"
        ? hasText(spec.min) || hasText(spec.max)
        : hasText(spec.value);
    case "place_group":
      return spec.groupIds.length > 0;
  }
}

function matchesText(value: CellValue, term: string): boolean {
  if (typeof value !== "string") return false;
  return value.toLowerCase().includes(term.trim().toLowerCase());
}

function matchesNumber(
  value: CellValue,
  spec: FilterSpec & { kind: "number" },
): boolean {
  if (typeof value !== "number") return false;
  switch (spec.op) {
    case "eq":
      return hasNumber(spec.value) && value === spec.value;
    case "gt":
      return hasNumber(spec.value) && value > spec.value;
    case "lt":
      return hasNumber(spec.value) && value < spec.value;
    case "between":
      return (
        (!hasNumber(spec.min) || value >= spec.min) &&
        (!hasNumber(spec.max) || value <= spec.max)
      );
  }
}

function matchesDate(
  value: CellValue,
  spec: FilterSpec & { kind: "date" },
): boolean {
  // ISO `YYYY-MM-DD` strings compare chronologically as plain strings.
  if (typeof value !== "string") return false;
  switch (spec.op) {
    case "on":
      return hasText(spec.value) && value === spec.value;
    case "before":
      return hasText(spec.value) && value < spec.value!;
    case "after":
      return hasText(spec.value) && value > spec.value!;
    case "between":
      return (
        (!hasText(spec.min) || value >= spec.min!) &&
        (!hasText(spec.max) || value <= spec.max!)
      );
  }
}

function matchesGroup(
  value: CellValue,
  spec: FilterSpec & { kind: "place_group" },
  groups: PlaceGroup[] | undefined,
): boolean {
  const wantUngrouped = spec.groupIds.includes(null);
  // Ungrouped means: no id, or an id that no longer names a live group.
  const isUngrouped =
    typeof value !== "string" || !groups?.some((group) => group.id === value);
  if (isUngrouped) return wantUngrouped;
  return spec.groupIds.includes(value as string);
}

/**
 * Does a cell value satisfy an (active) filter? An empty cell fails every
 * predicate except a `place_group` filter that includes "Ungrouped" — "no
 * value" cannot contain a term or satisfy a comparison.
 */
export function matchesFilter(
  value: CellValue,
  spec: FilterSpec,
  groups?: PlaceGroup[],
): boolean {
  switch (spec.kind) {
    case "text":
      return matchesText(value, spec.contains);
    case "place":
      return matchesText(isPlace(value) ? value.name : null, spec.contains);
    case "number":
      return matchesNumber(value, spec);
    case "date":
      return matchesDate(value, spec);
    case "place_group":
      return matchesGroup(value, spec, groups);
  }
}

/**
 * The row ids that survive every active filter (logical AND across columns),
 * in the input order. Inactive filters are ignored; the input is not mutated.
 */
export function filterRowIds(
  rows: Row[],
  filters: Record<string, FilterSpec>,
  groups?: PlaceGroup[],
): string[] {
  const active = Object.entries(filters).filter(([, spec]) => isActive(spec));
  return rows
    .filter((row) =>
      active.every(([columnId, spec]) =>
        matchesFilter(row.cells[columnId] ?? null, spec, groups),
      ),
    )
    .map((row) => row.id);
}

/** How many columns are actively filtered — the toolbar's badge count. */
export function activeFilterCount(filters: Record<string, FilterSpec>): number {
  return Object.values(filters).filter(isActive).length;
}
