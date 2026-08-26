import { describe, it, expect } from "vitest";
import { moveId } from "./reorder";

const IDS = ["a", "b", "c", "d"];

describe("moveId", () => {
  it("moves an item forward, closing the gap behind it", () => {
    expect(moveId(IDS, "a", "c")).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item backward", () => {
    expect(moveId(IDS, "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("keeps every id exactly once", () => {
    expect([...moveId(IDS, "a", "d")].sort()).toEqual([...IDS].sort());
  });

  it("is a no-op when the ids match or are unknown", () => {
    expect(moveId(IDS, "b", "b")).toBe(IDS);
    expect(moveId(IDS, "zz", "b")).toBe(IDS);
    expect(moveId(IDS, "b", "zz")).toBe(IDS);
  });

  it("does not mutate the input", () => {
    const original = [...IDS];
    moveId(IDS, "a", "c");
    expect(IDS).toEqual(original);
  });
});
