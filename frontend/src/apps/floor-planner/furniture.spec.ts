import { describe, it, expect } from "vitest";
import {
  colourHex,
  draftProblem,
  outline,
  sizeLabel,
  type PieceDraft,
} from "./furniture";

function draft(over: Partial<PieceDraft> = {}): PieceDraft {
  return {
    name: "Sofa",
    colour: "grey",
    note: "",
    shape: "rectangle",
    width_cm: 220,
    depth_cm: 95,
    cells: null,
    ...over,
  };
}

describe("furniture", () => {
  it("labels sizes, with a diameter for round pieces", () => {
    expect(sizeLabel(draft())).toBe("220 × 95 cm");
    expect(
      sizeLabel(draft({ shape: "round", width_cm: 110, depth_cm: 110 })),
    ).toBe("⌀ 110 cm");
  });

  it("maps colours to hex", () => {
    expect(colourHex("white")).toBe("#f4f3ef");
    expect(colourHex("blue")).toBe("#4f74a8");
  });

  it("draws each shape to scale", () => {
    expect(outline(draft(), 0.5)).toBe("M 0 0 H 110 V 47.5 H 0 Z");
    expect(
      outline(draft({ shape: "oval", width_cm: 160, depth_cm: 90 }), 1),
    ).toMatch(/^M 0 45 A 80 45 /);
    expect(
      outline(draft({ shape: "egg", width_cm: 100, depth_cm: 100 }), 1),
    ).toMatch(/^M 50 0 C 82 0 100 20 100 42 /);
    const custom = outline(draft({ shape: "custom", cells: ["#.", "##"] }), 1);
    expect(custom.match(/M /g)).toHaveLength(3);
    expect(custom).toContain("M 20 20 h 20 v 20 h -20 Z");
  });

  it.each([
    [{ name: " " }, "Name needs 1–40 characters"],
    [{ width_cm: 0 }, "Sizes must be 1–1000 cm"],
    [{ depth_cm: 12.5 }, "Sizes must be 1–1000 cm"],
    [
      { shape: "round" as const, width_cm: 80, depth_cm: 90 },
      "A round piece has one diameter",
    ],
    [{ shape: "custom" as const, cells: ["..."] }, "Paint at least one square"],
    [{ note: "x".repeat(201) }, "Note is longer than 200 characters"],
  ])("finds the problem in %o", (over, problem) => {
    expect(draftProblem(draft(over))).toBe(problem);
  });

  it("accepts a good draft", () => {
    expect(draftProblem(draft())).toBeNull();
    expect(draftProblem(draft({ shape: "custom", cells: ["#"] }))).toBeNull();
  });
});
