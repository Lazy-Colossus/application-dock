import { describe, it, expect } from "vitest";
import { moveId } from "./reorder";

describe("moveId", () => {
  const ids = ["a", "b", "c", "d"];

  it("moves a row up, before its target", () => {
    expect(moveId(ids, "d", "b", false)).toEqual(["a", "d", "b", "c"]);
  });

  it("moves a row down, after its target", () => {
    expect(moveId(ids, "a", "c", true)).toEqual(["b", "c", "a", "d"]);
  });

  it("leaves the list alone when dropped on itself", () => {
    expect(moveId(ids, "b", "b", true)).toBe(ids);
  });
});
