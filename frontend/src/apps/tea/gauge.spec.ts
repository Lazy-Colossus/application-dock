import { describe, it, expect } from "vitest";
import { circumferenceOf, dashPattern, RIM } from "./gauge";

describe("circumferenceOf", () => {
  it("is 2πr", () => {
    expect(circumferenceOf(17)).toBeCloseTo(106.81, 2);
  });
});

describe("dashPattern", () => {
  const C = circumferenceOf(17);

  it("draws a solid arc as dash-then-gap", () => {
    expect(dashPattern(C * 0.38, C, false)).toBe(`${C * 0.38} ${C - C * 0.38}`);
  });

  it("draws nothing for a zero arc", () => {
    expect(dashPattern(0, C, false)).toBe(`0 ${C}`);
  });

  it("breaks a low arc into 4-on 4.4-off segments", () => {
    const pattern = dashPattern(20, C, true).split(" ").map(Number);
    expect(pattern[0]).toBe(4);
    expect(pattern[1]).toBe(4.4);
  });

  it("sums a dashed pattern to exactly the circumference, so the cycle aligns", () => {
    const total = dashPattern(20, C, true).split(" ").map(Number).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(C, 6);
  });

  it("keeps an even segment count, so dashes and gaps stay in phase", () => {
    expect(dashPattern(20, C, true).split(" ").length % 2).toBe(0);
  });

  it("handles an arc shorter than one dash", () => {
    const pattern = dashPattern(2, C, true).split(" ").map(Number);
    expect(pattern[0]).toBe(2);
    expect(pattern.reduce((a, b) => a + b, 0)).toBeCloseTo(C, 6);
  });
});

describe("RIM", () => {
  it("makes the shelf gauge a 44px touch target", () => {
    expect(RIM.shelf.box).toBe(44);
  });

  it("gives the tea's page a larger rim", () => {
    expect(RIM.page.radius).toBeGreaterThan(RIM.shelf.radius);
  });
});
