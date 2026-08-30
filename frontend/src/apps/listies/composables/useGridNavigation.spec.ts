import { describe, it, expect } from "vitest";

import { useGridNavigation } from "./useGridNavigation";

// 3 rows (the last of which is the trailing ghost row) x 2 columns.
function nav(rows = 3, columns = 2) {
  return useGridNavigation(
    () => rows,
    () => columns,
  );
}

describe("useGridNavigation — focus", () => {
  it("starts with nothing focused", () => {
    expect(nav().focused.value).toBeNull();
  });

  it("focuses the cell it is told to", () => {
    const g = nav();
    g.focusCell(1, 1);
    expect(g.focused.value).toEqual({ rowIndex: 1, columnIndex: 1 });
  });

  it("reports whether a given cell is the focused one", () => {
    const g = nav();
    g.focusCell(1, 0);
    expect(g.isFocused(1, 0)).toBe(true);
    expect(g.isFocused(0, 0)).toBe(false);
  });

  it("ignores a focus request outside the grid", () => {
    const g = nav();
    g.focusCell(9, 9);
    expect(g.focused.value).toBeNull();
  });
});

describe("useGridNavigation — arrows clamp at the edges", () => {
  it("moves right, left, down and up", () => {
    const g = nav();
    g.focusCell(1, 0);

    g.moveRight();
    expect(g.focused.value).toEqual({ rowIndex: 1, columnIndex: 1 });
    g.moveLeft();
    expect(g.focused.value).toEqual({ rowIndex: 1, columnIndex: 0 });
    g.moveDown();
    expect(g.focused.value).toEqual({ rowIndex: 2, columnIndex: 0 });
    g.moveUp();
    expect(g.focused.value).toEqual({ rowIndex: 1, columnIndex: 0 });
  });

  it("stops at the right edge rather than wrapping", () => {
    const g = nav();
    g.focusCell(0, 1);
    g.moveRight();
    expect(g.focused.value).toEqual({ rowIndex: 0, columnIndex: 1 });
  });

  it("stops at the left edge", () => {
    const g = nav();
    g.focusCell(0, 0);
    g.moveLeft();
    expect(g.focused.value).toEqual({ rowIndex: 0, columnIndex: 0 });
  });

  it("stops at the bottom edge", () => {
    const g = nav();
    g.focusCell(2, 0);
    g.moveDown();
    expect(g.focused.value).toEqual({ rowIndex: 2, columnIndex: 0 });
  });

  it("stops at the top edge", () => {
    const g = nav();
    g.focusCell(0, 0);
    g.moveUp();
    expect(g.focused.value).toEqual({ rowIndex: 0, columnIndex: 0 });
  });

  it("does nothing when no cell is focused", () => {
    const g = nav();
    g.moveRight();
    expect(g.focused.value).toBeNull();
  });
});

describe("useGridNavigation — Tab wraps between rows", () => {
  it("moves to the next cell on the same row", () => {
    const g = nav();
    g.focusCell(0, 0);
    g.moveNext();
    expect(g.focused.value).toEqual({ rowIndex: 0, columnIndex: 1 });
  });

  it("wraps from the last column to the first cell of the next row", () => {
    const g = nav();
    g.focusCell(0, 1);
    g.moveNext();
    expect(g.focused.value).toEqual({ rowIndex: 1, columnIndex: 0 });
  });

  it("stays put at the very last cell of the grid", () => {
    const g = nav();
    g.focusCell(2, 1);
    g.moveNext();
    expect(g.focused.value).toEqual({ rowIndex: 2, columnIndex: 1 });
  });

  it("wraps backwards from the first column to the last cell of the previous row", () => {
    const g = nav();
    g.focusCell(1, 0);
    g.movePrevious();
    expect(g.focused.value).toEqual({ rowIndex: 0, columnIndex: 1 });
  });

  it("stays put at the very first cell of the grid", () => {
    const g = nav();
    g.focusCell(0, 0);
    g.movePrevious();
    expect(g.focused.value).toEqual({ rowIndex: 0, columnIndex: 0 });
  });
});

describe("useGridNavigation — edit mode", () => {
  it("is not editing to begin with", () => {
    const g = nav();
    g.focusCell(0, 0);
    expect(g.editing.value).toBe(false);
  });

  it("begins and ends editing on the focused cell", () => {
    const g = nav();
    g.focusCell(0, 0);

    g.beginEdit();
    expect(g.isEditing(0, 0)).toBe(true);

    g.endEdit();
    expect(g.isEditing(0, 0)).toBe(false);
  });

  it("cannot begin editing with nothing focused", () => {
    const g = nav();
    g.beginEdit();
    expect(g.editing.value).toBe(false);
  });

  it("stops editing when focus moves", () => {
    const g = nav();
    g.focusCell(0, 0);
    g.beginEdit();

    g.moveNext();

    expect(g.editing.value).toBe(false);
    expect(g.focused.value).toEqual({ rowIndex: 0, columnIndex: 1 });
  });

  it("only reports the focused cell as editing", () => {
    const g = nav();
    g.focusCell(1, 1);
    g.beginEdit();
    expect(g.isEditing(0, 0)).toBe(false);
    expect(g.isEditing(1, 1)).toBe(true);
  });
});

describe("useGridNavigation — a shrinking grid", () => {
  it("drops focus that no longer exists", () => {
    let rows = 3;
    const g = useGridNavigation(
      () => rows,
      () => 2,
    );
    g.focusCell(2, 1);

    rows = 1;
    g.clampToGrid();

    expect(g.focused.value).toEqual({ rowIndex: 0, columnIndex: 1 });
  });
});
