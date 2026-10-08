import { describe, it, expect } from "vitest";
import { emptyMask, maskSize, pad, toggle, trim } from "./customShape";

describe("customShape", () => {
  it("paints and clears squares", () => {
    let mask = toggle(emptyMask(3), { col: 1, row: 2 }, true);
    expect(mask).toEqual(["...", "...", ".#."]);
    mask = toggle(mask, { col: 1, row: 2 }, false);
    expect(mask).toEqual(emptyMask(3));
  });

  it("trims an L to its bounding box", () => {
    expect(trim(["....", ".#..", ".#..", ".###", "...."])).toEqual([
      "#..",
      "#..",
      "###",
    ]);
    expect(trim(emptyMask(4))).toEqual([]);
  });

  it("round-trips through pad and trim", () => {
    const l = ["#..", "#..", "###"];
    const padded = pad(l, 20);
    expect(padded).toHaveLength(20);
    expect(padded[0]).toHaveLength(20);
    expect(trim(padded)).toEqual(l);
  });

  it("sizes a mask in squares and cm", () => {
    expect(maskSize(["#########", "#........"])).toEqual({
      cols: 9,
      rows: 2,
      widthCm: 180,
      depthCm: 40,
    });
    expect(maskSize([])).toEqual({ cols: 0, rows: 0, widthCm: 0, depthCm: 0 });
  });
});
