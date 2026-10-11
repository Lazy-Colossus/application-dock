import { describe, it, expect } from "vitest";
import { canRedo, canUndo, createHistory, push, redo, undo } from "./history";

describe("history", () => {
  it("undoes and redoes one step at a time", () => {
    let h = push(push(createHistory("a"), "b"), "c");
    h = undo(h);
    expect(h.present).toBe("b");
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present).toBe("c");
    h = undo(undo(h));
    expect(h.present).toBe("a");
    expect(canUndo(h)).toBe(false);
    expect(undo(h)).toBe(h);
  });

  it("drops the redo stack when a new step is pushed after an undo", () => {
    const h = push(undo(push(createHistory(1), 2)), 3);
    expect(h.present).toBe(3);
    expect(canRedo(h)).toBe(false);
    expect(h.past).toEqual([1]);
  });
});
