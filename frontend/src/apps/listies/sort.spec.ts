import { describe, it, expect } from "vitest";

import { compareValues, sortRowIds } from "./sort";
import type { CellValue, Column, ColumnType, Row } from "@/apps/listies/types";

const column = (type: ColumnType): Column => ({
  id: "c-1",
  name: "Col",
  type,
  order: 0,
});

const rows = (values: CellValue[]): Row[] =>
  values.map((v, i) => ({
    id: `r-${i}`,
    order: i,
    cells: (v === null ? {} : { "c-1": v }) as Record<string, CellValue>,
    created_at: "t",
    updated_at: "t",
  }));

const idsAsc = (values: CellValue[], type: ColumnType) =>
  sortRowIds(rows(values), column(type), "asc");
const idsDesc = (values: CellValue[], type: ColumnType) =>
  sortRowIds(rows(values), column(type), "desc");

describe("compareValues — text", () => {
  it("compares alphabetically, ignoring case", () => {
    expect(compareValues("apple", "Banana", "text")).toBeLessThan(0);
    expect(compareValues("Banana", "apple", "text")).toBeGreaterThan(0);
  });

  it("treats equal strings as equal", () => {
    expect(compareValues("Tent", "tent", "text")).toBe(0);
  });
});

describe("compareValues — number", () => {
  it("compares numerically, not as strings", () => {
    expect(compareValues(9, 10, "number")).toBeLessThan(0);
  });

  it("handles negatives and decimals", () => {
    expect(compareValues(-3, 1.5, "number")).toBeLessThan(0);
  });
});

describe("compareValues — date", () => {
  it("compares chronologically", () => {
    expect(compareValues("2026-01-09", "2026-02-01", "date")).toBeLessThan(0);
  });
});

describe("compareValues — empties", () => {
  it("puts an empty value after a filled one", () => {
    expect(compareValues(null, "a", "text")).toBeGreaterThan(0);
    expect(compareValues("a", null, "text")).toBeLessThan(0);
  });

  it("treats two empties as equal", () => {
    expect(compareValues(null, null, "text")).toBe(0);
  });
});

describe("sortRowIds", () => {
  it("sorts text ascending and descending", () => {
    expect(idsAsc(["Tent", "Mat", "Stove"], "text")).toEqual([
      "r-1",
      "r-2",
      "r-0",
    ]);
    expect(idsDesc(["Tent", "Mat", "Stove"], "text")).toEqual([
      "r-0",
      "r-2",
      "r-1",
    ]);
  });

  it("sorts numbers numerically", () => {
    expect(idsAsc([10, 9, 100], "number")).toEqual(["r-1", "r-0", "r-2"]);
  });

  it("sorts dates chronologically", () => {
    expect(idsAsc(["2026-02-01", "2026-01-09"], "date")).toEqual([
      "r-1",
      "r-0",
    ]);
  });

  it("keeps empty cells last when ascending", () => {
    expect(idsAsc(["Tent", null, "Mat"], "text")).toEqual([
      "r-2",
      "r-0",
      "r-1",
    ]);
  });

  it("keeps empty cells last when descending too", () => {
    expect(idsDesc(["Tent", null, "Mat"], "text")).toEqual([
      "r-0",
      "r-2",
      "r-1",
    ]);
  });

  it("is stable: ties keep the order they came in", () => {
    expect(idsAsc(["same", "same", "same"], "text")).toEqual([
      "r-0",
      "r-1",
      "r-2",
    ]);
  });

  it("sorts an empty list to an empty list", () => {
    expect(sortRowIds([], column("text"), "asc")).toEqual([]);
  });

  it("does not mutate the rows it was given", () => {
    const input = rows(["Tent", "Mat"]);
    sortRowIds(input, column("text"), "asc");
    expect(input.map((r) => r.id)).toEqual(["r-0", "r-1"]);
  });
});

describe("sorting a place column (Story 4.2)", () => {
  const place = (name: string) => ({
    place_id: `ChIJ_${name}`,
    name,
    address: "somewhere",
    lat: 0,
    lng: 0,
  });

  const placeRows = (names: (string | null)[]): Row[] =>
    names.map((n, i) => ({
      id: `r-${i}`,
      order: i,
      cells: (n === null ? {} : { "c-1": place(n) }) as Record<
        string,
        CellValue
      >,
      created_at: "t",
      updated_at: "t",
    }));

  it("compares by place name", () => {
    const ids = sortRowIds(
      placeRows(["Tent Cafe", "Blue Bottle", "Mat Roasters"]),
      column("place"),
      "asc",
    );
    expect(ids).toEqual(["r-1", "r-2", "r-0"]);
  });

  it("reverses on descending", () => {
    const ids = sortRowIds(
      placeRows(["Tent Cafe", "Blue Bottle"]),
      column("place"),
      "desc",
    );
    expect(ids).toEqual(["r-0", "r-1"]);
  });

  it("keeps empty place cells last", () => {
    const ids = sortRowIds(
      placeRows(["Tent Cafe", null, "Blue Bottle"]),
      column("place"),
      "asc",
    );
    expect(ids).toEqual(["r-2", "r-0", "r-1"]);
  });
});
