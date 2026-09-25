import { describe, it, expect } from "vitest";
import { CLASS_ORDER, CLASS_TOKENS } from "./tokens";

describe("class tokens", () => {
  it("orders the classes as the Chinese classification does", () => {
    expect(CLASS_ORDER).toEqual([
      "green",
      "yellow",
      "white",
      "oolong",
      "red",
      "dark",
      "other",
    ]);
  });

  it("has tokens for every class", () => {
    for (const id of CLASS_ORDER) {
      const tokens = CLASS_TOKENS[id];
      expect(tokens.liquor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(tokens.head).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(tokens.zh).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(tokens.label.length).toBeGreaterThan(0);
      expect(tokens.labelZh.length).toBeGreaterThan(0);
    }
  });

  it("gives the dark class the broad assamica leaf and everything else sinensis", () => {
    expect(CLASS_TOKENS.dark.leaf).toBe("assamica");
    for (const id of CLASS_ORDER.filter((c) => c !== "dark")) {
      expect(CLASS_TOKENS[id].leaf).toBe("sinensis");
    }
  });

  it("never uses the dock's gold, which means interactive elsewhere", () => {
    for (const id of CLASS_ORDER) {
      expect(CLASS_TOKENS[id].liquor.toLowerCase()).not.toBe("#c8960a");
    }
  });
});
