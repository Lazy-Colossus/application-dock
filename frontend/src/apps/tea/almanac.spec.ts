import { describe, it, expect } from "vitest";
import { chapterAt, groupAlmanac, pickRandom } from "./almanac";
import type { AlmanacEntryView, CatalogueNode } from "./types";

function node(id: string, parent_id: string | null): CatalogueNode {
  return {
    id,
    parent_id,
    name: id,
    name_zh: "",
    default_origin: "",
    source: "seed",
  };
}

const NODES: CatalogueNode[] = [
  node("green", null),
  node("green.longjing", "green"),
  node("green.japanese", "green"),
  node("green.japanese.sencha", "green.japanese"),
  node("oolong", null),
  node("oolong.tieguanyin", "oolong"),
  node("oolong.taiwanese", "oolong"),
  node("oolong.taiwanese.alishan", "oolong.taiwanese"),
  node("red", null),
  node("red.qimen", "red"),
];

function entry(
  catalogue_node_id: string,
  country: string,
  name: string,
): AlmanacEntryView {
  return {
    catalogue_node_id,
    country,
    reading: "",
    summary: "",
    brewing: { leaf_grams: null, water_temp_c: null, steep_seconds: [] },
    source: "seed",
    name,
    name_zh: "",
    default_origin: "",
  };
}

const LONGJING = entry("green.longjing", "China", "Longjing");
const SENCHA = entry("green.japanese.sencha", "Japan", "Sencha");
const TIEGUANYIN = entry("oolong.tieguanyin", "China", "Tieguanyin");
const ALISHAN = entry("oolong.taiwanese.alishan", "Taiwan", "Alishan");
const QIMEN = entry("red.qimen", "China", "Qimen");
const ALL = [SENCHA, QIMEN, ALISHAN, TIEGUANYIN, LONGJING];

describe("groupAlmanac by class", () => {
  it("makes one chapter per class present, in the classification's order", () => {
    const chapters = groupAlmanac(ALL, NODES, "class");
    expect(chapters.map((c) => c.key)).toEqual(["green", "oolong", "red"]);
    expect(chapters[0]).toMatchObject({
      label: "Green",
      labelZh: "綠茶",
      classId: "green",
      count: 2,
    });
  });

  it("groups each class by country, busiest country first", () => {
    const [green, oolong] = groupAlmanac(ALL, NODES, "class");
    expect(green.groups.map((g) => g.label)).toEqual(["China", "Japan"]);
    expect(oolong.groups.map((g) => g.label)).toEqual(["China", "Taiwan"]);
  });

  it("buckets an entry whose node the catalogue doesn't know under other", () => {
    const chapters = groupAlmanac(
      [entry("mystery", "Nowhere", "Mystery")],
      NODES,
      "class",
    );
    expect(chapters.map((c) => c.key)).toEqual(["other"]);
  });
});

describe("groupAlmanac by place", () => {
  it("orders countries by entry count, ties alphabetically", () => {
    const chapters = groupAlmanac(ALL, NODES, "place");
    expect(chapters.map((c) => c.key)).toEqual(["China", "Japan", "Taiwan"]);
    expect(chapters[0]).toMatchObject({
      label: "China",
      labelZh: "",
      classId: null,
      count: 3,
    });
  });

  it("groups each country by class in the classification's order", () => {
    const [china] = groupAlmanac(ALL, NODES, "place");
    expect(china.groups.map((g) => g.classId)).toEqual([
      "green",
      "oolong",
      "red",
    ]);
    expect(china.groups.map((g) => g.label)).toEqual([
      "Green",
      "Oolong",
      "Red",
    ]);
  });

  it("sorts entries A–Z within a group", () => {
    const b = entry("green.longjing", "China", "Biluochun");
    const [china] = groupAlmanac([LONGJING, b], NODES, "place");
    expect(china.groups[0].entries.map((e) => e.name)).toEqual([
      "Biluochun",
      "Longjing",
    ]);
  });
});

it("returns no chapters for no entries", () => {
  expect(groupAlmanac([], NODES, "class")).toEqual([]);
  expect(groupAlmanac([], NODES, "place")).toEqual([]);
});

describe("pickRandom", () => {
  it("returns null when there is nothing to pick", () => {
    expect(pickRandom([], () => 0.5)).toBeNull();
  });

  it("maps the random number across the whole list", () => {
    expect(pickRandom(ALL, () => 0)).toBe(ALL[0]);
    expect(pickRandom(ALL, () => 0.999)).toBe(ALL[4]);
  });
});

describe("chapterAt", () => {
  it("is the last chapter whose top has reached the line", () => {
    expect(chapterAt([0, 5000, 5700], 5100)).toBe(1);
    expect(chapterAt([0, 5000, 5700], 5700)).toBe(2);
  });

  it("is the first chapter before any has reached the line", () => {
    expect(chapterAt([200, 5000], 50)).toBe(0);
  });

  it("skips chapters that are gone", () => {
    expect(chapterAt([0, Number.POSITIVE_INFINITY, 900], 1000)).toBe(2);
  });

  it("is -1 when no chapter is left", () => {
    expect(chapterAt([], 0)).toBe(-1);
    expect(chapterAt([Number.POSITIVE_INFINITY], 0)).toBe(-1);
  });
});
