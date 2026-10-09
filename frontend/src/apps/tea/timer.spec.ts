import { describe, it, expect } from "vitest";
import {
  CUP_LIQUOR,
  GRACE_SECONDS,
  graceLeft,
  loggedSeconds,
  shownSeconds,
  TARGET_LEVEL,
  darken,
  fillLevel,
  formatElapsed,
  genericCurve,
  newSessionId,
  overSteep,
  targetFor,
} from "./timer";

describe("targetFor", () => {
  it("reads the curve, then extends by 5s past its end", () => {
    expect(targetFor([20, 25, 30], 1)).toBe(20);
    expect(targetFor([20, 25, 30], 3)).toBe(30);
    expect(targetFor([20, 25, 30], 5)).toBe(40);
  });

  it("falls back to the generic curve for an empty list", () => {
    expect(targetFor([], 1)).toBe(10);
    expect(targetFor([], 6)).toBe(35);
  });
});

describe("genericCurve", () => {
  it("is the generic source with its label", () => {
    const curve = genericCurve();
    expect(curve.source).toBe("generic");
    expect(curve.source_label).toBe("generic gongfu");
    expect(curve.steep_seconds).toEqual([10, 15, 20, 25]);
    expect(genericCurve("generic gongfu (couldn't load tea curve)").source_label).toContain(
      "couldn't",
    );
  });
});

describe("fillLevel", () => {
  it("is empty at 0, reaches the line at the target, stops at the rim", () => {
    expect(fillLevel(0, 20)).toBe(0);
    expect(fillLevel(10, 20)).toBeCloseTo(TARGET_LEVEL / 2);
    expect(fillLevel(20, 20)).toBeCloseTo(TARGET_LEVEL);
    expect(fillLevel(30, 20)).toBeGreaterThan(TARGET_LEVEL);
    expect(fillLevel(40, 20)).toBe(1);
    expect(fillLevel(400, 20)).toBe(1);
  });

  it("never divides by a zero target", () => {
    expect(fillLevel(5, 0)).toBe(0);
  });
});

describe("overSteep", () => {
  it("is 0 up to the target and grows to 1 at twice the target", () => {
    expect(overSteep(20, 20)).toBe(0);
    expect(overSteep(30, 20)).toBeCloseTo(0.5);
    expect(overSteep(90, 20)).toBe(1);
  });
});

describe("colours", () => {
  it("has the cup palette chosen in the design session", () => {
    expect(CUP_LIQUOR.oolong).toBe("#d49a3f");
    expect(CUP_LIQUOR.other).toBe("#bdb56a");
  });

  it("darken(…, 0) is identity and darken(…, 1) is darker", () => {
    expect(darken("#d49a3f", 0)).toBe("#d49a3f");
    expect(darken("#d49a3f", 1)).not.toBe("#d49a3f");
    expect(darken("#ffffff", 1)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("formatElapsed", () => {
  it("renders m:ss", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(17.6)).toBe("0:17");
    expect(formatElapsed(75)).toBe("1:15");
  });
});

describe("newSessionId", () => {
  it("mints distinct ids", () => {
    const a = newSessionId();
    expect(a).toMatch(/^s-[0-9a-f]{32}$/);
    expect(newSessionId()).not.toBe(a);
  });
});

describe("grace after the target", () => {
  it("logs the target for a stop inside the window, the real time otherwise", () => {
    expect(GRACE_SECONDS).toBe(3);
    expect(loggedSeconds(19.4, 20)).toBe(19);
    expect(loggedSeconds(20, 20)).toBe(20);
    expect(loggedSeconds(22.9, 20)).toBe(20);
    expect(loggedSeconds(23, 20)).toBe(23);
  });

  it("holds the shown clock at the target inside the window", () => {
    expect(shownSeconds(19.5, 20)).toBe(19.5);
    expect(shownSeconds(21.7, 20)).toBe(20);
    expect(shownSeconds(23.2, 20)).toBe(23.2);
  });

  it("reports the share of the window left, or null outside it", () => {
    expect(graceLeft(19, 20)).toBeNull();
    expect(graceLeft(20, 20)).toBe(1);
    expect(graceLeft(21.5, 20)).toBe(0.5);
    expect(graceLeft(23, 20)).toBeNull();
  });
});
