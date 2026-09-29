import { describe, it, expect } from "vitest";
import {
  TASTING_SECTIONS,
  describeTasting,
  emptyTasting,
  filledCount,
  getAt,
  isEmptyTasting,
  setAt,
  tastingLine,
  tastingSummary,
} from "./tasting";
import type { Tasting } from "./types";

function leafPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    leafPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

function tasting(edit: (t: Tasting) => void): Tasting {
  const t = emptyTasting();
  edit(t);
  return t;
}

describe("the sheet description", () => {
  it("covers every field of the tasting, and only those", () => {
    const listed = TASTING_SECTIONS.flatMap((s) => s.fields.map((f) => f.path)).sort();
    expect(listed).toEqual(leafPaths(emptyTasting()).sort());
  });

  it("reads and writes by path without touching the original", () => {
    const t = emptyTasting();
    const next = setAt(t, "sensation.hui_gan.strength", 4);
    expect(getAt(next, "sensation.hui_gan.strength")).toBe(4);
    expect(getAt(t, "sensation.hui_gan.strength")).toBeNull();
  });

  it("knows an untouched or cleared tasting is empty", () => {
    expect(isEmptyTasting(emptyTasting())).toBe(true);
    expect(isEmptyTasting(tasting((t) => (t.aroma.top_note = "   ")))).toBe(true);
    expect(isEmptyTasting(tasting((t) => (t.aroma.structure = ["long"])))).toBe(false);
    expect(isEmptyTasting(tasting((t) => (t.liquor.clarity = 3)))).toBe(false);
  });

  it("counts what a section has noted", () => {
    const t = tasting((x) => {
      x.aroma.aroma = "orchid";
      x.aroma.richness = 4;
      x.sensation.throat = 3;
    });
    const aroma = TASTING_SECTIONS.find((s) => s.key === "aroma")!;
    expect(filledCount(t, aroma)).toBe(2);
  });
});

describe("tastingLine", () => {
  it("names the aroma type, the body and the strongest of hui gan, throat and smoothness", () => {
    const t = tasting((x) => {
      x.aroma.aroma = "orchid, honey";
      x.aroma.aroma_type = "orchid";
      x.sensation.body = "mellow";
      x.sensation.smoothness = 3;
      x.sensation.hui_gan.strength = 4;
      x.sensation.throat = 4;
    });
    expect(tastingLine(t)).toBe("orchid · mellow · hui gan ★★★★");
  });

  it("falls back to the aroma and leaves out what isn't there", () => {
    expect(tastingLine(tasting((x) => (x.aroma.aroma = "roasted")))).toBe("roasted");
    expect(tastingLine(emptyTasting())).toBe("");
  });
});

describe("describeTasting", () => {
  it("lists only the filled fields, in words", () => {
    const blocks = describeTasting(
      tasting((x) => {
        x.aroma.top_note = "orchid";
        x.aroma.structure = ["delicate", "long"];
        x.sensation.body = "mellow";
        x.sensation.saturation = "fairly_high";
        x.sensation.hui_gan.strength = 4;
      }),
    );
    expect(blocks.map((b) => b.key)).toEqual(["aroma", "sensation"]);
    const rows = blocks.flatMap((b) => b.rows.map((r) => `${r.label}: ${r.value}`));
    expect(rows).toContain("Top note: orchid");
    expect(rows).toContain("Aroma structure: delicate · long");
    expect(rows).toContain("Saturation: fairly high");
    expect(rows).toContain("Hui gan — strength: ★★★★☆");
  });

  it("keeps each aroma stage's wording and the notebook's Chinese", () => {
    const [aroma] = describeTasting(tasting((x) => (x.aroma.base_note = "stone")));
    expect(aroma.rows[0]).toMatchObject({ label: "Base note", zh: "后调", hint: "after swallowing" });
  });
});

describe("tastingSummary", () => {
  it("is null until some sitting is tasted", () => {
    expect(tastingSummary([{ tasting: null }, { tasting: emptyTasting() }])).toBeNull();
  });

  it("averages every rated star field, skipping sittings that left it unrated", () => {
    const summary = tastingSummary([
      { tasting: tasting((x) => (x.sensation.hui_gan.strength = 4)) },
      { tasting: tasting((x) => (x.sensation.hui_gan.strength = 3)) },
      { tasting: tasting((x) => (x.aroma.aroma = "orchid")) },
      { tasting: null },
    ])!;
    expect(summary.count).toBe(3);
    expect(summary.stars).toEqual([
      { path: "sensation.hui_gan.strength", label: "Hui gan — strength", average: 3.5, count: 2 },
    ]);
  });

  it("finds the usual body, earlier on the scale winning a tie", () => {
    const summary = tastingSummary([
      { tasting: tasting((x) => (x.sensation.body = "thick")) },
      { tasting: tasting((x) => (x.sensation.body = "mellow")) },
    ])!;
    expect(summary.body).toBe("mellow");
    expect(summary.saturation).toBeNull();
  });

  it("keeps aroma words that come back in two or more sittings, however they were typed", () => {
    const summary = tastingSummary([
      { tasting: tasting((x) => (x.aroma.aroma = "Orchid, honey,")) },
      { tasting: tasting((x) => (x.aroma.aroma_type = " orchid")) },
      { tasting: tasting((x) => (x.aroma.aroma = "stone")) },
    ])!;
    expect(summary.aromaWords).toEqual(["orchid"]);
  });

  it("splits aroma words on Chinese commas too", () => {
    const summary = tastingSummary([
      { tasting: tasting((x) => (x.aroma.aroma = "兰花，蜜香")) },
      { tasting: tasting((x) => (x.aroma.aroma = "兰花、焙火")) },
    ])!;
    expect(summary.aromaWords).toEqual(["兰花"]);
  });

  it("counts structure words most-picked first", () => {
    const summary = tastingSummary([
      { tasting: tasting((x) => (x.aroma.structure = ["delicate", "long"])) },
      { tasting: tasting((x) => (x.aroma.structure = ["long"])) },
    ])!;
    expect(summary.structure.map((s) => [s.value, s.count])).toEqual([
      ["long", 2],
      ["delicate", 1],
    ]);
  });
});
