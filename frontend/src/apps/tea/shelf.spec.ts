import { describe, it, expect } from "vitest";
import {
  proportionOf,
  thresholdFractionOf,
  isLow,
  pricePerGram,
  sortSection,
  groupByClass,
  nearestSectionIndex,
  imageSrc,
} from "./shelf";
import type { Tea, TeaClass } from "./types";

function tea(overrides: Partial<Tea> = {}): Tea {
  return {
    id: "t-1",
    name: "A tea",
    catalogue_node_id: "oolong",
    class_id: "oolong",
    form: null,
    origin: "",
    vendor: "",
    year: null,
    harvest_season: null,
    cultivar: "",
    grams_purchased: 100,
    grams_remaining: 38,
    price_paid: null,
    purchase_date: null,
    storage_location: "",
    low_threshold_grams: null,
    notes: "",
    image_url: null,
    created_at: "2026-09-25T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
    ...overrides,
  };
}

describe("proportionOf", () => {
  it("is remaining over purchased", () => {
    expect(proportionOf(tea({ grams_purchased: 100, grams_remaining: 38 }))).toBeCloseTo(0.38);
  });

  it("is null when the amount bought is unknown", () => {
    expect(proportionOf(tea({ grams_purchased: null }))).toBeNull();
  });

  it("is null when the amount bought is zero, never Infinity", () => {
    expect(proportionOf(tea({ grams_purchased: 0, grams_remaining: 5 }))).toBeNull();
  });

  it("clamps above one, so a corrected top-up cannot overdraw the rim", () => {
    expect(proportionOf(tea({ grams_purchased: 50, grams_remaining: 80 }))).toBe(1);
  });

  it("is zero for an empty tea", () => {
    expect(proportionOf(tea({ grams_remaining: 0 }))).toBe(0);
  });
});

describe("thresholdFractionOf", () => {
  it("places the tick at threshold over purchased", () => {
    expect(
      thresholdFractionOf(tea({ grams_purchased: 50, low_threshold_grams: 15 })),
    ).toBeCloseTo(0.3);
  });

  it("is null with no threshold set", () => {
    expect(thresholdFractionOf(tea({ low_threshold_grams: null }))).toBeNull();
  });

  it("is null when the amount bought is unknown", () => {
    expect(
      thresholdFractionOf(tea({ grams_purchased: null, low_threshold_grams: 15 })),
    ).toBeNull();
  });
});

describe("isLow", () => {
  it("is true below the threshold", () => {
    expect(isLow(tea({ grams_remaining: 12, low_threshold_grams: 15 }))).toBe(true);
  });

  it("is true exactly at the threshold", () => {
    expect(isLow(tea({ grams_remaining: 15, low_threshold_grams: 15 }))).toBe(true);
  });

  it("is false above the threshold", () => {
    expect(isLow(tea({ grams_remaining: 16, low_threshold_grams: 15 }))).toBe(false);
  });

  it("is false with no threshold set", () => {
    expect(isLow(tea({ grams_remaining: 1, low_threshold_grams: null }))).toBe(false);
  });

  it("does not call an empty tea low — empty has its own state", () => {
    expect(isLow(tea({ grams_remaining: 0, low_threshold_grams: 15 }))).toBe(false);
  });
});

describe("pricePerGram", () => {
  it("divides what you paid by what you bought", () => {
    expect(pricePerGram(tea({ price_paid: 68, grams_purchased: 100 }))).toBeCloseTo(0.68);
  });

  it("is null without a price", () => {
    expect(pricePerGram(tea({ price_paid: null }))).toBeNull();
  });

  it("is null when the amount bought is zero, never Infinity", () => {
    expect(pricePerGram(tea({ price_paid: 68, grams_purchased: 0 }))).toBeNull();
  });
});

describe("sortSection", () => {
  it("sorts by name A to Z", () => {
    const sorted = sortSection([tea({ id: "b", name: "Rou Gui" }), tea({ id: "a", name: "Da Hong Pao" })]);
    expect(sorted.map((t) => t.name)).toEqual(["Da Hong Pao", "Rou Gui"]);
  });

  it("sinks empty teas to the end of the section", () => {
    const sorted = sortSection([
      tea({ id: "a", name: "Aaa", grams_remaining: 0 }),
      tea({ id: "z", name: "Zzz", grams_remaining: 10 }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["z", "a"]);
  });

  it("sorts empties among themselves by name", () => {
    const sorted = sortSection([
      tea({ id: "z", name: "Zzz", grams_remaining: 0 }),
      tea({ id: "a", name: "Aaa", grams_remaining: 0 }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["a", "z"]);
  });

  it("does not mutate its input", () => {
    const input = [tea({ id: "b", name: "B" }), tea({ id: "a", name: "A" })];
    sortSection(input);
    expect(input.map((t) => t.id)).toEqual(["b", "a"]);
  });
});

describe("groupByClass", () => {
  it("returns sections in the classification's order", () => {
    const sections = groupByClass([
      tea({ id: "1", class_id: "dark" }),
      tea({ id: "2", class_id: "green" }),
      tea({ id: "3", class_id: "oolong" }),
    ]);
    expect(sections.map((s) => s.classId)).toEqual(["green", "oolong", "dark"]);
  });

  it("omits classes with no teas", () => {
    const sections = groupByClass([tea({ class_id: "white" })]);
    expect(sections.map((s) => s.classId)).toEqual(["white"]);
  });

  it("returns nothing for an empty cabinet", () => {
    expect(groupByClass([])).toEqual([]);
  });

  it("sorts within each section", () => {
    const sections = groupByClass([
      tea({ id: "b", name: "Zzz", class_id: "green" }),
      tea({ id: "a", name: "Aaa", class_id: "green" }),
    ]);
    expect(sections[0].teas.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("buckets an unrecognised class into other rather than dropping the tea", () => {
    const sections = groupByClass([
      tea({ id: "x", class_id: "chrysanthemum" as unknown as TeaClass }),
    ]);
    expect(sections.map((s) => s.classId)).toEqual(["other"]);
    expect(sections[0].teas.map((t) => t.id)).toEqual(["x"]);
  });
});

describe("nearestSectionIndex", () => {
  it("picks the section whose centre is closest to the midline", () => {
    expect(nearestSectionIndex([100, 400, 900], 380)).toBe(1);
  });

  it("picks the first when the midline is above everything", () => {
    expect(nearestSectionIndex([100, 400, 900], 0)).toBe(0);
  });

  it("picks the last when the midline is below everything", () => {
    expect(nearestSectionIndex([100, 400, 900], 5000)).toBe(2);
  });

  it("returns -1 with no sections", () => {
    expect(nearestSectionIndex([], 100)).toBe(-1);
  });
});

describe("imageSrc", () => {
  it("returns null when the tea has no image", () => {
    expect(imageSrc(null, "a-token")).toBeNull();
  });

  it("passes an external URL through unchanged", () => {
    expect(imageSrc("https://example.com/photo.jpg", "a-token")).toBe(
      "https://example.com/photo.jpg",
    );
  });

  it("appends the auth token as a query param for our own served image route", () => {
    expect(imageSrc("/api/tea/teas/t-1/image", "a-token")).toBe(
      "/api/tea/teas/t-1/image?token=a-token",
    );
  });

  it("returns null for our own served route when there is no token to authenticate with", () => {
    expect(imageSrc("/api/tea/teas/t-1/image", null)).toBeNull();
  });
});
