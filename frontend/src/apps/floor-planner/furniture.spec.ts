import { describe, it, expect } from "vitest";
import {
  colourHex,
  copyName,
  customEdges,
  customFills,
  mainColour,
  draftProblem,
  fitScale,
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
    const custom = outline(draft({ shape: "custom", cells: ["g.", "gu"] }), 1);
    expect(custom.match(/M /g)).toHaveLength(3);
    expect(custom).toContain("M 10 10 h 10 v 10 h -10 Z");
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
    expect(draftProblem(draft({ shape: "custom", cells: ["g"] }))).toBeNull();
  });
});

describe("copyName", () => {
  it("adds copy, trimming a long name to fit the limit", () => {
    expect(copyName("Sofa")).toBe("Sofa copy");
    const long = copyName("x".repeat(40));
    expect(long).toHaveLength(40);
    expect(long.endsWith("x copy")).toBe(true);
  });
});

describe("fitScale", () => {
  it("keeps the scale when the piece fits and shrinks it when not", () => {
    expect(fitScale(draft({ width_cm: 100, depth_cm: 60 }), 0.8, 228)).toBe(
      0.8,
    );
    expect(fitScale(draft({ width_cm: 570, depth_cm: 60 }), 0.8, 228)).toBe(
      0.4,
    );
  });
});

describe("customEdges", () => {
  it("outlines only the outside of the painted squares", () => {
    // Two squares side by side: 6 outer edges, the shared middle edge left out.
    // Two squares side by side, in different colours: 6 outer edges, the shared middle one left out.
    const edges = customEdges(["gu"], 1);
    expect(edges.match(/M /g)).toHaveLength(6);
    expect(edges).not.toContain("M 10 0 v 10");
    expect(edges).toContain("M 20 0 v 10");
  });
});

describe("customFills", () => {
  it("draws one path per colour, in the order first painted", () => {
    const fills = customFills(["ug", "g."], 1);
    expect(fills.map((f) => f.colour)).toEqual(["blue", "grey"]);
    expect(fills[0].d).toBe("M 0 0 h 10 v 10 h -10 Z");
    expect(fills[1].d.match(/M /g)).toHaveLength(2);
  });
});

describe("mainColour", () => {
  it("picks the most painted colour, the first painted on a tie", () => {
    expect(mainColour(["ugg"], "red")).toBe("grey");
    expect(mainColour(["ug", "gu"], "red")).toBe("blue");
    expect(mainColour([".."], "red")).toBe("red");
  });
});
