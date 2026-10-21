import { describe, it, expect } from "vitest";
import {
  buildRunIndex,
  measureAt,
  measureText,
  rulerText,
  snapPoint,
  straightPoint,
} from "./measure";
import type { PlanGrid } from "./grid";

/** `#` wall, `D` door, `.` floor, ` ` outside; one character per square. */
function plan(rows: string[]): PlanGrid {
  const feature = { "#": "wl", D: "dr" } as Record<string, string>;
  return {
    cols: rows[0].length,
    rows: rows.length,
    feature: rows.map((r) => [...r].map((ch) => feature[ch] ?? "..").join("")),
    surface: rows.map((r) =>
      [...r].map((ch) => (ch === "." ? "w1" : "..")).join(""),
    ),
    labels: [],
    doors: [],
    sockets: [],
    notes: [],
  };
}

const flat = plan([
  "##DD######",
  "#........#",
  "#........#",
  "#........#",
  "##########",
  "          ",
]);
const index = buildRunIndex(flat);

describe("measureAt", () => {
  it("measures a wall run up to the door that splits it", () => {
    expect(measureAt(index, { col: 6, row: 0 })).toEqual({
      kind: "feature",
      code: "wl",
      dir: "h",
      span: { col: 4, row: 0, len: 6 },
    });
    expect(measureText(measureAt(index, { col: 6, row: 0 })!)).toBe(
      "Wall · 0.30 m",
    );
  });

  it("measures the door itself", () => {
    expect(measureText(measureAt(index, { col: 2, row: 0 })!)).toBe(
      "Door · 0.10 m",
    );
  });

  it("follows the wall's long direction", () => {
    expect(measureAt(index, { col: 0, row: 2 })).toMatchObject({
      dir: "v",
      span: { col: 0, row: 0, len: 5 },
    });
  });

  it("gives the clear span wall to wall across open floor", () => {
    const m = measureAt(index, { col: 3, row: 2 });
    expect(m).toEqual({
      kind: "floor",
      h: { col: 1, row: 2, len: 8 },
      v: { col: 3, row: 1, len: 3 },
    });
    expect(measureText(m!)).toBe("Dimensions 0.40 × 0.15 m");
  });

  it("has nothing to say outside the apartment", () => {
    expect(measureAt(index, { col: 3, row: 5 })).toBeNull();
  });
});

describe("the ruler", () => {
  it("snaps to the nearest grid corner and stays on the plan", () => {
    expect(snapPoint({ x: 12.4, y: 7.6 }, 10, 6)).toEqual({ x: 10, y: 10 });
    expect(snapPoint({ x: -8, y: 99 }, 10, 6)).toEqual({ x: 0, y: 30 });
  });

  it("straightens to whichever axis the pointer strays from least", () => {
    const a = { x: 10, y: 10 };
    expect(straightPoint(a, { x: 60, y: 25 })).toEqual({ x: 60, y: 10 });
    expect(straightPoint(a, { x: 15, y: 90 })).toEqual({ x: 10, y: 90 });
  });

  it("reads the length, and both sides on a slant", () => {
    expect(rulerText({ x: 0, y: 0 }, { x: 240, y: 0 })).toBe("2.40 m");
    expect(rulerText({ x: 0, y: 0 }, { x: 120, y: 90 })).toBe(
      "1.50 m · 1.20 × 0.90",
    );
  });
});
