import { describe, it, expect } from "vitest";
import { RESOURCES, TIERS, cellName, emptyGrid } from "./resources";

describe("resources", () => {
  it("lists the five resources and three tiers in display order", () => {
    expect(RESOURCES.map((r) => r.name)).toEqual([
      "Mikroorganizmy",
      "Mimozemské technológie",
      "Minerály",
      "Podivná flóra",
      "Živé exempláre",
    ]);
    expect(TIERS.map((t) => t.name)).toEqual([
      "Základný",
      "Vzácny",
      "Veľmi vzácny",
    ]);
  });

  it("builds a fresh all-zero grid each call", () => {
    const a = emptyGrid();
    a.minerals.rare = 3;
    expect(emptyGrid().minerals.rare).toBe(0);
    expect(Object.keys(emptyGrid())).toHaveLength(5);
  });

  it("names a cell", () => {
    expect(cellName("minerals", "very_rare")).toBe("Minerály · Veľmi vzácny");
  });
});
