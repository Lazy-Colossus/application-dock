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

import { parseCell } from "./coerce";

describe("parseCell — text", () => {
  it("keeps what was typed", () => {
    expect(parseCell("Tent", "text")).toEqual({ ok: true, value: "Tent" });
  });

  it("treats an empty or whitespace entry as clearing the cell", () => {
    expect(parseCell("", "text")).toEqual({ ok: true, value: null });
    expect(parseCell("   ", "text")).toEqual({ ok: true, value: null });
  });
});

describe("parseCell — number", () => {
  it("parses a plain number", () => {
    expect(parseCell("12", "number")).toEqual({ ok: true, value: 12 });
    expect(parseCell("1.5", "number")).toEqual({ ok: true, value: 1.5 });
    expect(parseCell("-3", "number")).toEqual({ ok: true, value: -3 });
  });

  it("parses zero as zero, not as empty", () => {
    expect(parseCell("0", "number")).toEqual({ ok: true, value: 0 });
  });

  it("treats an empty entry as clearing the cell — not as zero", () => {
    expect(parseCell("", "number")).toEqual({ ok: true, value: null });
    expect(parseCell("  ", "number")).toEqual({ ok: true, value: null });
  });

  it("rejects something that is not a number", () => {
    expect(parseCell("abc", "number").ok).toBe(false);
    expect(parseCell("12abc", "number").ok).toBe(false);
  });

  it("rejects infinity", () => {
    expect(parseCell("Infinity", "number").ok).toBe(false);
  });
});

describe("parseCell — date", () => {
  it("accepts an ISO date", () => {
    expect(parseCell("2026-09-02", "date")).toEqual({
      ok: true,
      value: "2026-09-02",
    });
  });

  it("treats an empty entry as clearing the cell", () => {
    expect(parseCell("", "date")).toEqual({ ok: true, value: null });
  });

  it("rejects a non-ISO format", () => {
    expect(parseCell("02/09/2026", "date").ok).toBe(false);
  });

  it("rejects a date that does not exist", () => {
    expect(parseCell("2026-02-31", "date").ok).toBe(false);
  });

  it("explains why it rejected, for display beside the cell", () => {
    const result = parseCell("abc", "number");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });
});
