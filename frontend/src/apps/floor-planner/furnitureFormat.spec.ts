import { describe, it, expect } from "vitest";
import { parseFurnitureList, type ParsedLine } from "./furnitureFormat";

const reasons = (lines: ParsedLine[]) =>
  lines.map((l) => (l.ok ? "ok" : l.reason));

describe("parseFurnitureList", () => {
  it("reads one good line of each listed shape", () => {
    const lines = parseFurnitureList(
      [
        "Sofa; rectangle; 220 x 95; grey; IKEA Kivik",
        "Coffee table; round; 80; brown",
        "Dining table; oval; 160 x 90; beige",
        "Egg chair; egg; 85 x 90; green",
      ].join("\n"),
    );
    expect(reasons(lines)).toEqual(["ok", "ok", "ok", "ok"]);
    expect(lines[0]).toMatchObject({
      line: 1,
      piece: {
        name: "Sofa",
        shape: "rectangle",
        width_cm: 220,
        depth_cm: 95,
        colour: "grey",
        note: "IKEA Kivik",
        cells: null,
      },
    });
    expect(lines[1]).toMatchObject({
      piece: { shape: "round", width_cm: 80, depth_cm: 80, note: "" },
    });
  });

  it("ignores case, takes × and loose spacing, and a trailing ;", () => {
    const [line] = parseFurnitureList("SOFA ;Rectangle;220X95 ;GREY;");
    expect(line).toMatchObject({
      ok: true,
      piece: {
        name: "SOFA",
        shape: "rectangle",
        width_cm: 220,
        colour: "grey",
      },
    });
    expect(parseFurnitureList("Bed; rectangle; 160×200; white")[0].ok).toBe(
      true,
    );
  });

  it("skips blank lines but keeps real line numbers", () => {
    const lines = parseFurnitureList(
      "\n  \nBed; rectangle; 160 x 200; white\n\n",
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].line).toBe(3);
  });

  it.each([
    ["Sofa; rectangle; 220 x 95", "needs name; shape; size; colour"],
    ["; rectangle; 220 x 95; grey", "needs name; shape; size; colour"],
    [
      "Rug; square; 200 x 200; grey",
      "unknown shape 'square' — use rectangle, round, oval or egg",
    ],
    [
      "L sofa; custom; 300 x 200; grey",
      "custom shapes are painted — add it with Add a piece",
    ],
    ["Sofa; rectangle; 220; grey", "size should be W x D in cm, e.g. 220 x 95"],
    [
      "Sofa; rectangle; 2.2 x 0.95; grey",
      "size should be W x D in cm, e.g. 220 x 95",
    ],
    [
      "Table; round; 80 x 80; brown",
      "a round piece takes one size, its diameter, e.g. 110",
    ],
    ["Wall unit; rectangle; 1200 x 40; white", "sizes must be 1–1000 cm"],
    ["Shelf; rectangle; 0 x 30; white", "sizes must be 1–1000 cm"],
    ["Sofa; rectangle; 220 x 95; teal", "unknown colour 'teal'"],
    [
      `${"x".repeat(41)}; rectangle; 10 x 10; grey`,
      "name is longer than 40 characters",
    ],
    [
      "Sofa; rectangle; 220 x 95; grey; note; more",
      "too many parts — a note can't contain ';'",
    ],
  ])("refuses %j", (text, reason) => {
    expect(parseFurnitureList(text)[0]).toMatchObject({ ok: false, reason });
  });
});
