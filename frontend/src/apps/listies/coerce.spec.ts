import { describe, it, expect } from "vitest";

import { EMPTY_DISPLAY, formatCell, typeGlyph } from "./coerce";

describe("formatCell", () => {
  it("shows a muted dash for an empty cell, whatever the type", () => {
    expect(formatCell(null, "text")).toBe(EMPTY_DISPLAY);
    expect(formatCell(null, "number")).toBe(EMPTY_DISPLAY);
    expect(formatCell(null, "date")).toBe(EMPTY_DISPLAY);
  });

  it("keeps zero visible — it is a value, not an empty cell", () => {
    expect(formatCell(0, "number")).toBe("0");
  });

  it("renders text as-is", () => {
    expect(formatCell("Tent", "text")).toBe("Tent");
  });

  it("renders a number without reformatting it", () => {
    expect(formatCell(1.5, "number")).toBe("1.5");
    expect(formatCell(12, "number")).toBe("12");
  });

  it("renders an ISO date in the compact display form", () => {
    expect(formatCell("2026-09-02", "date")).toBe("02 Sep 26");
    expect(formatCell("2026-12-25", "date")).toBe("25 Dec 26");
  });

  it("passes a malformed date through rather than inventing one", () => {
    expect(formatCell("nonsense", "date")).toBe("nonsense");
  });
});

describe("typeGlyph", () => {
  it("gives each column type a distinct glyph", () => {
    const glyphs = [typeGlyph("text"), typeGlyph("number"), typeGlyph("date")];
    expect(new Set(glyphs).size).toBe(3);
    expect(glyphs.every((g) => g.length > 0)).toBe(true);
  });
});
