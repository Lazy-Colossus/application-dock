import { describe, it, expect } from "vitest";
import {
  ERASER,
  FLOORS,
  STRUCTURE,
  floorBrush,
  structureBrush,
  fillFor,
} from "./codes";
import {
  cellAt,
  codeAt,
  emptyRows,
  labelAtCell,
  labelsOutside,
  lineCells,
  paint,
  readout,
  rectCells,
  resize,
  runs,
  squaresFor,
  uniqueCells,
  type PlanGrid,
} from "./grid";

const wall = structureBrush(STRUCTURE[0]);
const whiteTile = floorBrush(FLOORS[0]);

function grid(cols = 5, rows = 4): PlanGrid {
  return {
    cols,
    rows,
    surface: emptyRows(cols, rows),
    feature: emptyRows(cols, rows),
    labels: [],
  };
}

describe("lineCells", () => {
  it.each([
    [{ col: 0, row: 0 }, { col: 3, row: 0 }, 4],
    [{ col: 2, row: 5 }, { col: 2, row: 1 }, 5],
    [{ col: 0, row: 0 }, { col: 3, row: 3 }, 4],
    [{ col: 0, row: 0 }, { col: 1, row: 6 }, 7],
  ])("joins %o to %o with no gaps", (a, b, count) => {
    const cells = lineCells(a, b);
    expect(cells).toHaveLength(count);
    expect(cells[0]).toEqual(a);
    expect(cells.at(-1)).toEqual(b);
    for (let i = 1; i < cells.length; i++) {
      expect(Math.abs(cells[i].col - cells[i - 1].col)).toBeLessThanOrEqual(1);
      expect(Math.abs(cells[i].row - cells[i - 1].row)).toBeLessThanOrEqual(1);
    }
  });
});

describe("rectCells", () => {
  it("fills the box whichever corner the drag starts at", () => {
    const a = rectCells({ col: 1, row: 1 }, { col: 2, row: 3 });
    const b = rectCells({ col: 2, row: 3 }, { col: 1, row: 1 });
    expect(a).toHaveLength(6);
    expect(new Set(b.map((c) => `${c.col},${c.row}`))).toEqual(
      new Set(a.map((c) => `${c.col},${c.row}`)),
    );
  });
});

describe("paint", () => {
  it("lays a wall over the floor without erasing the floor", () => {
    const tiled = paint(grid(), [{ col: 1, row: 1 }], whiteTile);
    const walled = paint(tiled, [{ col: 1, row: 1 }], wall);
    expect(codeAt(walled.surface, { col: 1, row: 1 })).toBe("t0");
    expect(codeAt(walled.feature, { col: 1, row: 1 })).toBe("wl");
  });

  it("leaves the feature layer alone when painting a floor", () => {
    const walled = paint(grid(), [{ col: 0, row: 0 }], wall);
    const tiled = paint(
      walled,
      [{ col: 0, row: 0 }],
      floorBrush(FLOORS[1], "w2"),
    );
    expect(codeAt(tiled.feature, { col: 0, row: 0 })).toBe("wl");
    expect(codeAt(tiled.surface, { col: 0, row: 0 })).toBe("w2");
  });

  it("erases both layers", () => {
    const g = paint(
      paint(grid(), [{ col: 2, row: 2 }], whiteTile),
      [{ col: 2, row: 2 }],
      wall,
    );
    const erased = paint(g, [{ col: 2, row: 2 }], ERASER);
    expect(codeAt(erased.surface, { col: 2, row: 2 })).toBe("..");
    expect(codeAt(erased.feature, { col: 2, row: 2 })).toBe("..");
  });

  it("ignores squares outside the plan and never mutates its input", () => {
    const g = grid();
    const before = JSON.stringify(g);
    const out = paint(
      g,
      [
        { col: 9, row: 0 },
        { col: -1, row: 0 },
        { col: 0, row: 0 },
      ],
      wall,
    );
    expect(JSON.stringify(g)).toBe(before);
    expect(out.feature[0]).toBe("wl........");
  });
});

describe("resize", () => {
  it("grows with empty squares on the right and bottom", () => {
    const g = paint(grid(2, 2), [{ col: 1, row: 1 }], whiteTile);
    const out = resize(g, 3, 3);
    expect(out.surface).toEqual(["......", "..t0..", "......"]);
  });

  it("crops and drops labels left outside", () => {
    const g = {
      ...grid(),
      labels: [
        { id: "a", text: "Hall", col: 4, row: 0 },
        { id: "b", text: "Bath", col: 1, row: 1 },
      ],
    };
    expect(labelsOutside(g, 3, 4)).toBe(1);
    const out = resize(g, 3, 4);
    expect(out.surface[0]).toBe("......");
    expect(out.labels.map((l) => l.id)).toEqual(["b"]);
  });
});

describe("runs", () => {
  it("merges same-code squares and skips empties", () => {
    expect(runs(["t0t0t0..w1"])).toEqual([
      { row: 0, col: 0, len: 3, code: "t0" },
      { row: 0, col: 4, len: 1, code: "w1" },
    ]);
  });
});

describe("readout", () => {
  it("gives one length for a one-square-wide stroke", () => {
    expect(
      readout(lineCells({ col: 0, row: 0 }, { col: 16, row: 0 }), "Wall"),
    ).toBe("Wall · 3.40 m");
  });

  it("gives both sides for a box", () => {
    expect(
      readout(rectCells({ col: 0, row: 0 }, { col: 7, row: 12 }), "Tile"),
    ).toBe("Tile · 1.60 × 2.60 m");
  });
});

describe("squaresFor", () => {
  it.each([
    [8.8, 44],
    [8.81, 45],
    [1, 5],
    [7.4, 37],
  ])("%s m is %s squares", (m, squares) => {
    expect(squaresFor(m)).toBe(squares);
  });
});

describe("uniqueCells", () => {
  it("drops repeats, keeping order", () => {
    expect(
      uniqueCells([
        { col: 1, row: 0 },
        { col: 1, row: 0 },
        { col: 2, row: 0 },
      ]),
    ).toEqual([
      { col: 1, row: 0 },
      { col: 2, row: 0 },
    ]);
  });
});

describe("fillFor", () => {
  it("maps codes to colours and the balcony to its pattern", () => {
    expect(fillFor("w1")).toBe("#a8743f");
    expect(fillFor("wl")).toBe("#2f2f2f");
    expect(fillFor("b0")).toBe("url(#fp-balcony)");
    expect(fillFor("..")).toBe("transparent");
  });
});

describe("cellAt", () => {
  const rect = { left: 100, top: 50 };
  it("finds the square under the pointer at 100 %", () => {
    // Square (0,0) starts after the 40 cm ruler: 32 px in at 0.8 px/cm.
    expect(cellAt(100 + 32, 50 + 32, rect, 1, 10, 10)).toEqual({
      col: 0,
      row: 0,
    });
    expect(
      cellAt(100 + 32 + 16 * 3 + 1, 50 + 32 + 16, rect, 1, 10, 10),
    ).toEqual({
      col: 3,
      row: 1,
    });
  });

  it("scales with zoom without changing which square is hit", () => {
    expect(cellAt(100 + 64 + 32 * 3 + 1, 50 + 64, rect, 2, 10, 10)).toEqual({
      col: 3,
      row: 0,
    });
  });

  it("is null on the rulers and past the plan", () => {
    expect(cellAt(100 + 10, 50 + 40, rect, 1, 10, 10)).toBeNull();
    expect(cellAt(100 + 32 + 16 * 10, 50 + 40, rect, 1, 10, 10)).toBeNull();
  });
});

describe("labelAtCell", () => {
  it("hits the squares a label's text covers on its row", () => {
    const labels = [{ id: "a", text: "Living room", col: 2, row: 3 }];
    expect(labelAtCell(labels, { col: 2, row: 3 }, 1)?.id).toBe("a");
    expect(labelAtCell(labels, { col: 5, row: 3 }, 1)?.id).toBe("a");
    expect(labelAtCell(labels, { col: 2, row: 4 }, 1)).toBeNull();
    expect(labelAtCell(labels, { col: 1, row: 3 }, 1)).toBeNull();
  });
});
