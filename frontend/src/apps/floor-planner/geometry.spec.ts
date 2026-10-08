import { describe, it, expect } from "vitest";
import {
  bounds,
  centreInside,
  snap,
  topLeftForCentre,
  warningText,
  warnings,
  type Placed,
} from "./geometry";
import { emptyRows, type PlanGrid } from "./grid";
import type { Furniture, Rotation } from "./types";

function piece(over: Partial<Furniture> = {}): Furniture {
  return {
    id: "f_sofa",
    name: "Sofa",
    colour: "grey",
    note: "",
    shape: "rectangle",
    width_cm: 220,
    depth_cm: 95,
    cells: null,
    ...over,
  };
}

function placed(
  p: Furniture,
  x: number,
  y: number,
  rotation: Rotation = 0,
): Placed {
  return {
    piece: p,
    placement: { furniture_id: p.id, x_cm: x, y_cm: y, rotation },
  };
}

/** A 10 × 10 square plan of medium wood with no walls. */
function plan(): PlanGrid {
  return {
    cols: 10,
    rows: 10,
    surface: Array.from({ length: 10 }, () => "w1".repeat(10)),
    feature: emptyRows(10, 10),
    labels: [],
  };
}

describe("bounds", () => {
  const at = (rotation: Rotation) => ({ x_cm: 100, y_cm: 200, rotation });

  it("is the piece itself at 0° and 180°", () => {
    expect(bounds(piece(), at(0))).toEqual({ x: 100, y: 200, w: 220, h: 95 });
    expect(bounds(piece(), at(180))).toEqual({ x: 100, y: 200, w: 220, h: 95 });
  });

  it("swaps the sides about the same centre at 90° and 270°", () => {
    const b = bounds(piece(), at(90));
    expect(b).toEqual({ x: 162.5, y: 137.5, w: 95, h: 220 });
    expect(b.x + b.w / 2).toBe(210);
    expect(b.y + b.h / 2).toBe(247.5);
    expect(bounds(piece(), at(270))).toEqual(b);
  });
});

describe("snap", () => {
  it.each([
    [14, 10],
    [15, 20],
    [-6, -10],
    [-4, 0],
    [0, 0],
  ])("%s → %s", (v, out) => {
    expect(snap(v)).toBe(out);
  });
});

describe("topLeftForCentre", () => {
  it("centres the piece on the point, snapped", () => {
    const tl = topLeftForCentre(piece(), 300, 300);
    expect(tl).toEqual({ x: 190, y: 250 });
    const b = bounds(piece(), { x_cm: tl.x, y_cm: tl.y, rotation: 0 });
    expect(Math.abs(b.x + b.w / 2 - 300)).toBeLessThanOrEqual(5);
  });
});

describe("centreInside", () => {
  it("allows the centre on the edge but not past it", () => {
    const p = piece({ width_cm: 40, depth_cm: 40 });
    expect(centreInside(p, 180, 0, plan())).toBe(true);
    expect(centreInside(p, 181, 0, plan())).toBe(false);
    expect(centreInside(p, -20, -20, plan())).toBe(true);
    expect(centreInside(p, -21, 0, plan())).toBe(false);
  });
});

describe("warnings", () => {
  const box = piece({ id: "f_box", name: "Box", width_cm: 40, depth_cm: 40 });

  it("is quiet on open floor", () => {
    expect(warnings(placed(box, 40, 40), plan(), [])).toEqual([]);
  });

  it("warns about a wall under the box but not one it only touches", () => {
    const p = plan();
    p.feature[3] = "wl".repeat(10);
    expect(warnings(placed(box, 40, 50), p, [])).toEqual([{ kind: "wall" }]);
    expect(warnings(placed(box, 40, 20), p, [])).toEqual([]);
  });

  it("warns outside the apartment and past the plan's edge", () => {
    const p = plan();
    p.surface[0] = "..".repeat(10);
    expect(warnings(placed(box, 40, 0), p, [])).toEqual([{ kind: "outside" }]);
    expect(warnings(placed(box, 180, 100), plan(), [])).toEqual([
      { kind: "outside" },
    ]);
  });

  it("names a piece it overlaps, but not one it only touches", () => {
    const other = piece({
      id: "f_bed",
      name: "Bed",
      width_cm: 40,
      depth_cm: 40,
    });
    const near = [placed(other, 60, 40)];
    expect(warnings(placed(box, 40, 40), plan(), near)).toEqual([
      { kind: "overlap", name: "Bed" },
    ]);
    expect(warnings(placed(box, 20, 40), plan(), near)).toEqual([]);
  });

  it("can give every warning at once, and ignores the piece itself", () => {
    const p = plan();
    p.feature[0] = "wl".repeat(10);
    p.surface[1] = "..".repeat(10);
    const self = placed(box, 0, 0);
    const other = placed(
      piece({ id: "f_bed", name: "Bed", width_cm: 40, depth_cm: 40 }),
      20,
      0,
    );
    expect(warnings(self, p, [self, other]).map(warningText)).toEqual([
      "Overlaps a wall",
      "Outside the apartment",
      "Overlaps Bed",
    ]);
  });
});
