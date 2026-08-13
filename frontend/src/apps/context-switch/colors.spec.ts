import { describe, it, expect } from "vitest";
import {
  PRESET_COLORS,
  isHexColor,
  readableTextColor,
  relativeLuminance,
} from "./colors";

describe("isHexColor", () => {
  it("accepts 3- and 6-digit hex", () => {
    expect(isHexColor("#fff")).toBe(true);
    expect(isHexColor("#AABBCC")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isHexColor("red")).toBe(false);
    expect(isHexColor("#12345")).toBe(false);
    expect(isHexColor("aabbcc")).toBe(false);
  });
});

describe("relativeLuminance", () => {
  it("spans black to white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });
});

describe("readableTextColor", () => {
  it("uses dark text on light backgrounds", () => {
    expect(readableTextColor("#ffffff")).toBe("#000000");
    expect(readableTextColor("#fff475")).toBe("#000000");
  });

  it("uses light text on dark backgrounds", () => {
    expect(readableTextColor("#000000")).toBe("#ffffff");
    expect(readableTextColor("#202124")).toBe("#ffffff");
  });

  it("returns a readable choice for every preset", () => {
    for (const preset of PRESET_COLORS) {
      const text = readableTextColor(preset);
      const bg = relativeLuminance(preset);
      const fg = relativeLuminance(text);
      const contrast = (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05);
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    }
  });
});
