import { describe, it, expect } from "vitest";

import {
  activeFilterCount,
  filterRowIds,
  isActive,
  matchesFilter,
} from "./filter";
import type { FilterSpec } from "./filter";
import type { CellValue, Place, PlaceGroup, Row } from "@/apps/listies/types";

const place = (name: string): Place => ({
  place_id: `ChIJ_${name}`,
  name,
  address: `${name} street`,
  lat: 1,
  lng: 2,
});

const GROUPS: PlaceGroup[] = [
  { id: "g-1", name: "Must see", color: "#e5484d" },
  { id: "g-2", name: "Maybe", color: "#3e63dd" },
];

// Rows carrying a single value under column "c-1".
const rows = (values: CellValue[]): Row[] =>
  values.map((v, i) => ({
    id: `r-${i}`,
    order: i,
    cells: (v === null ? {} : { "c-1": v }) as Record<string, CellValue>,
    created_at: "t",
    updated_at: "t",
  }));

describe("isActive", () => {
  it("treats an empty term / boundless number / no groups as inactive", () => {
    expect(isActive({ kind: "text", contains: "" })).toBe(false);
    expect(isActive({ kind: "text", contains: "  " })).toBe(false);
    expect(isActive({ kind: "number", op: "eq" })).toBe(false);
    expect(isActive({ kind: "number", op: "between" })).toBe(false);
    expect(isActive({ kind: "date", op: "on" })).toBe(false);
    expect(isActive({ kind: "place_group", groupIds: [] })).toBe(false);
  });

  it("treats a filled term / a bound / a chosen group as active", () => {
    expect(isActive({ kind: "text", contains: "a" })).toBe(true);
    expect(isActive({ kind: "number", op: "eq", value: 0 })).toBe(true);
    expect(isActive({ kind: "number", op: "between", max: 5 })).toBe(true);
    expect(isActive({ kind: "date", op: "after", value: "2026-01-01" })).toBe(
      true,
    );
    expect(isActive({ kind: "place_group", groupIds: [null] })).toBe(true);
  });
});

describe("matchesFilter — text", () => {
  const spec: FilterSpec = { kind: "text", contains: "en" };

  it("keeps a case-insensitive substring match", () => {
    expect(matchesFilter("Tent", spec)).toBe(true);
    expect(matchesFilter("ENORMOUS", spec)).toBe(true);
  });

  it("drops a non-match and an empty cell", () => {
    expect(matchesFilter("Stove", spec)).toBe(false);
    expect(matchesFilter(null, spec)).toBe(false);
  });
});

describe("matchesFilter — number", () => {
  it("applies equals / greater / less", () => {
    expect(matchesFilter(5, { kind: "number", op: "eq", value: 5 })).toBe(true);
    expect(matchesFilter(6, { kind: "number", op: "eq", value: 5 })).toBe(
      false,
    );
    expect(matchesFilter(6, { kind: "number", op: "gt", value: 5 })).toBe(true);
    expect(matchesFilter(4, { kind: "number", op: "lt", value: 5 })).toBe(true);
  });

  it("applies an inclusive between range, open on either side", () => {
    const between: FilterSpec = {
      kind: "number",
      op: "between",
      min: 2,
      max: 4,
    };
    expect([1, 2, 3, 4, 5].map((n) => matchesFilter(n, between))).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
    expect(matchesFilter(9, { kind: "number", op: "between", min: 5 })).toBe(
      true,
    );
  });

  it("drops an empty cell", () => {
    expect(matchesFilter(null, { kind: "number", op: "eq", value: 0 })).toBe(
      false,
    );
  });
});

describe("matchesFilter — date", () => {
  it("compares chronologically for on / before / after", () => {
    expect(
      matchesFilter("2026-09-02", {
        kind: "date",
        op: "on",
        value: "2026-09-02",
      }),
    ).toBe(true);
    expect(
      matchesFilter("2026-09-01", {
        kind: "date",
        op: "before",
        value: "2026-09-02",
      }),
    ).toBe(true);
    expect(
      matchesFilter("2026-09-03", {
        kind: "date",
        op: "after",
        value: "2026-09-02",
      }),
    ).toBe(true);
  });

  it("applies an inclusive between range", () => {
    const spec: FilterSpec = {
      kind: "date",
      op: "between",
      min: "2026-09-01",
      max: "2026-09-30",
    };
    expect(matchesFilter("2026-09-15", spec)).toBe(true);
    expect(matchesFilter("2026-10-01", spec)).toBe(false);
  });
});

describe("matchesFilter — place (by name)", () => {
  const spec: FilterSpec = { kind: "place", contains: "blue" };

  it("matches the place snapshot's name, case-insensitively", () => {
    expect(matchesFilter(place("Blue Bottle"), spec)).toBe(true);
    expect(matchesFilter(place("Fabrica"), spec)).toBe(false);
  });

  it("drops an empty place cell", () => {
    expect(matchesFilter(null, spec)).toBe(false);
  });
});

describe("matchesFilter — place_group", () => {
  it("keeps rows whose group id is selected", () => {
    const spec: FilterSpec = { kind: "place_group", groupIds: ["g-1"] };
    expect(matchesFilter("g-1", spec, GROUPS)).toBe(true);
    expect(matchesFilter("g-2", spec, GROUPS)).toBe(false);
  });

  it("Ungrouped matches an empty cell and a dangling id, but not a live group", () => {
    const spec: FilterSpec = { kind: "place_group", groupIds: [null] };
    expect(matchesFilter(null, spec, GROUPS)).toBe(true);
    expect(matchesFilter("g-gone", spec, GROUPS)).toBe(true);
    expect(matchesFilter("g-1", spec, GROUPS)).toBe(false);
  });

  it("combines a group and Ungrouped", () => {
    const spec: FilterSpec = { kind: "place_group", groupIds: ["g-1", null] };
    expect(matchesFilter("g-1", spec, GROUPS)).toBe(true);
    expect(matchesFilter(null, spec, GROUPS)).toBe(true);
    expect(matchesFilter("g-2", spec, GROUPS)).toBe(false);
  });
});

describe("filterRowIds", () => {
  it("keeps the input order and returns surviving ids", () => {
    const list = rows(["Tent", "Stove", "Tenderloin"]);
    const ids = filterRowIds(list, {
      "c-1": { kind: "text", contains: "ten" },
    });
    expect(ids).toEqual(["r-0", "r-2"]);
  });

  it("ignores an inactive filter (keeps everything)", () => {
    const list = rows(["Tent", "Stove"]);
    expect(
      filterRowIds(list, { "c-1": { kind: "text", contains: "" } }),
    ).toEqual(["r-0", "r-1"]);
  });

  it("ANDs across multiple columns", () => {
    const list: Row[] = [
      {
        id: "r-0",
        order: 0,
        cells: { name: "Tent", qty: 5 },
        created_at: "t",
        updated_at: "t",
      },
      {
        id: "r-1",
        order: 1,
        cells: { name: "Tent", qty: 1 },
        created_at: "t",
        updated_at: "t",
      },
      {
        id: "r-2",
        order: 2,
        cells: { name: "Stove", qty: 5 },
        created_at: "t",
        updated_at: "t",
      },
    ];
    const ids = filterRowIds(list, {
      name: { kind: "text", contains: "tent" },
      qty: { kind: "number", op: "gt", value: 3 },
    });
    expect(ids).toEqual(["r-0"]);
  });

  it("does not mutate the input array", () => {
    const list = rows(["Tent", "Stove"]);
    const copy = [...list];
    filterRowIds(list, { "c-1": { kind: "text", contains: "ten" } });
    expect(list).toEqual(copy);
  });
});

describe("activeFilterCount", () => {
  it("counts only the active filters", () => {
    expect(
      activeFilterCount({
        a: { kind: "text", contains: "x" },
        b: { kind: "text", contains: "" },
        c: { kind: "number", op: "eq", value: 1 },
      }),
    ).toBe(2);
  });
});
