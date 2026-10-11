import { describe, it, expect } from "vitest";
import {
  canDraw,
  emptyMask,
  maskSize,
  pad,
  paintSquares,
  toDrawn,
  trim,
  withCells,
} from "./customShape";
import type { PieceDraft } from "./furniture";

function draft(over: Partial<PieceDraft> = {}): PieceDraft {
  return {
    name: "Table",
    colour: "brown",
    note: "",
    shape: "rectangle",
    width_cm: 40,
    depth_cm: 20,
    cells: null,
    ...over,
  };
}

describe("customShape", () => {
  it("paints and clears squares, ignoring any outside the mask", () => {
    let mask = paintSquares(
      emptyMask(3),
      [
        { col: 1, row: 2 },
        { col: 5, row: 5 },
      ],
      "u",
    );
    expect(mask).toEqual(["...", "...", ".u."]);
    mask = paintSquares(mask, [{ col: 1, row: 2 }], ".");
    expect(mask).toEqual(emptyMask(3));
  });

  it("trims an L to its bounding box, whatever the colours", () => {
    expect(trim(["....", ".g..", ".u..", ".ggg", "...."])).toEqual([
      "g..",
      "u..",
      "ggg",
    ]);
    expect(trim(emptyMask(4))).toEqual([]);
  });

  it("round-trips through pad and trim", () => {
    const l = ["g..", "u..", "ggg"];
    const padded = pad(l, 40);
    expect(padded).toHaveLength(40);
    expect(padded[0]).toHaveLength(40);
    expect(trim(padded)).toEqual(l);
  });

  it("sizes a mask in 10 cm squares", () => {
    expect(maskSize(["ggggggggg", "g........"])).toEqual({
      cols: 9,
      rows: 2,
      widthCm: 90,
      depthCm: 20,
    });
    expect(maskSize([])).toEqual({ cols: 0, rows: 0, widthCm: 0, depthCm: 0 });
  });

  it("turns a rectangle into squares of its colour, to the nearest 10 cm", () => {
    expect(toDrawn(draft({ width_cm: 44, depth_cm: 16 }))).toMatchObject({
      shape: "custom",
      cells: ["bbbb", "bbbb"],
      width_cm: 40,
      depth_cm: 20,
      colour: "brown",
    });
  });

  it("turns a round table into a stepped circle", () => {
    const cells = toDrawn(
      draft({ shape: "round", width_cm: 60, depth_cm: 60 }),
    ).cells;
    expect(cells).toEqual([
      ".bbbb.",
      "bbbbbb",
      "bbbbbb",
      "bbbbbb",
      "bbbbbb",
      ".bbbb.",
    ]);
  });

  it("draws only shapes that fit in 4 m", () => {
    expect(canDraw(draft({ width_cm: 400 }))).toBe(true);
    expect(canDraw(draft({ width_cm: 401 }))).toBe(false);
    expect(canDraw(draft({ width_cm: 0 }))).toBe(false);
    expect(canDraw(draft({ shape: "custom", cells: [] }))).toBe(true);
  });

  it("sizes and colours a draft from what was painted", () => {
    expect(
      withCells(draft({ shape: "custom" }), ["....", ".uu.", ".gu."]),
    ).toMatchObject({
      cells: ["uu", "gu"],
      width_cm: 20,
      depth_cm: 20,
      colour: "blue",
    });
  });
});
