import { describe, it, expect } from "vitest";
import { washFor } from "./useWashScale";

describe("washFor", () => {
  it("is empty when nobody is on the day", () => {
    expect(washFor(0, 0, 6)).toEqual({ step: 0, provisional: false });
  });

  it("is empty when there is nobody to count against", () => {
    expect(washFor(0, 0, 0)).toEqual({ step: 0, provisional: false });
  });

  it("walks the ramp one step per person for a group of six", () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => washFor(n, 0, 6).step)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it("never rounds a single person away to nobody", () => {
    for (const total of [2, 3, 5, 8, 10, 12]) {
      expect(washFor(1, 0, total).step).toBeGreaterThanOrEqual(1);
    }
  });

  it("reaches the top step exactly at full coverage, for any group size", () => {
    for (const total of [1, 2, 3, 4, 5, 6, 7, 8, 10, 12]) {
      expect(washFor(total, 0, total).step).toBe(6);
      expect(washFor(total - 1, 0, total).step).toBeLessThan(6);
    }
  });

  it("is monotonic — one more person never dims a day", () => {
    for (const total of [3, 6, 9, 12]) {
      let previous = -1;
      for (let n = 0; n <= total; n += 1) {
        const { step } = washFor(n, 0, total);
        expect(step).toBeGreaterThanOrEqual(previous);
        previous = step;
      }
    }
  });

  it("counts if-needed toward coverage", () => {
    expect(washFor(3, 3, 6).step).toBe(washFor(6, 0, 6).step);
  });

  it("marks full coverage that leans on an if-needed", () => {
    expect(washFor(5, 1, 6)).toEqual({ step: 6, provisional: true });
  });

  it("does not mark an all-free day", () => {
    expect(washFor(6, 0, 6)).toEqual({ step: 6, provisional: false });
  });

  it("does not mark a day short of full coverage, if-needed or not", () => {
    expect(washFor(3, 1, 6).provisional).toBe(false);
    expect(washFor(0, 4, 6).provisional).toBe(false);
  });

  it("treats more coverage than the roster as full, not overflowing", () => {
    // Can happen for a moment after someone is removed, before a refetch.
    expect(washFor(7, 0, 6).step).toBe(6);
  });
});
