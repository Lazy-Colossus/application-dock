import { describe, it, expect } from "vitest";
import {
  GRID_MAX,
  GRID_MIN,
  clampGridValue,
  pageCount,
  pageSize,
  pageSlice,
} from "./grid";

describe("clampGridValue", () => {
  it("holds values inside the bounds", () => {
    expect(clampGridValue(4)).toBe(4);
    expect(clampGridValue(0)).toBe(GRID_MIN);
    expect(clampGridValue(-3)).toBe(GRID_MIN);
    expect(clampGridValue(99)).toBe(GRID_MAX);
  });

  it("truncates fractions and falls back for non-numbers", () => {
    expect(clampGridValue(3.7)).toBe(3);
    expect(clampGridValue(Number.NaN)).toBe(GRID_MIN);
  });
});

describe("pageSize", () => {
  it("is columns times rows", () => {
    expect(pageSize({ columns: 3, rows: 2 })).toBe(6);
  });
});

describe("pageCount", () => {
  it("is at least one page even with no todos", () => {
    expect(pageCount(0, { columns: 3, rows: 2 })).toBe(1);
  });

  it("adds a page per overflow chunk", () => {
    const grid = { columns: 2, rows: 2 };
    expect(pageCount(4, grid)).toBe(1);
    expect(pageCount(5, grid)).toBe(2);
    expect(pageCount(9, grid)).toBe(3);
  });
});

describe("pageSlice", () => {
  const items = [1, 2, 3, 4, 5];
  const grid = { columns: 2, rows: 1 };

  it("returns the chunk for the requested page", () => {
    expect(pageSlice(items, grid, 1)).toEqual([1, 2]);
    expect(pageSlice(items, grid, 2)).toEqual([3, 4]);
    expect(pageSlice(items, grid, 3)).toEqual([5]);
  });

  it("never silently hides a todo", () => {
    const pages = pageCount(items.length, grid);
    const seen = Array.from({ length: pages }, (_, i) =>
      pageSlice(items, grid, i + 1),
    ).flat();
    expect(seen).toEqual(items);
  });
});
