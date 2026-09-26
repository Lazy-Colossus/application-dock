import { describe, it, expect } from "vitest";
import { matchesFilters, type CabinetFilterState } from "./filters";
import type { Tea } from "./types";

function tea(overrides: Partial<Tea> = {}): Tea {
  return {
    id: "t-1",
    name: "Da Hong Pao",
    catalogue_node_id: "oolong.wuyi",
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

const NONE: CabinetFilterState = { nodeId: null, country: null, query: "", showEmpty: true };
const CHAIN = ["oolong", "oolong.wuyi"];

function matches(
  filters: Partial<CabinetFilterState>,
  t = tea(),
  country: string | null = "China",
) {
  return matchesFilters(t, { ...NONE, ...filters }, CHAIN, country);
}

describe("matchesFilters", () => {
  it("lets everything through with no filters set", () => {
    expect(matches({})).toBe(true);
  });

  it("matches a node anywhere in the tea's chain, not only its own", () => {
    expect(matches({ nodeId: "oolong" })).toBe(true);
    expect(matches({ nodeId: "oolong.wuyi" })).toBe(true);
    expect(matches({ nodeId: "green" })).toBe(false);
  });

  it("matches the country exactly, and never a tea with no known country", () => {
    expect(matches({ country: "China" })).toBe(true);
    expect(matches({ country: "Taiwan" })).toBe(false);
    expect(matches({ country: "China" }, tea(), null)).toBe(false);
  });

  it("searches the name case-insensitively, ignoring surrounding spaces", () => {
    expect(matches({ query: "  hong " })).toBe(true);
    expect(matches({ query: "HONG" })).toBe(true);
    expect(matches({ query: "longjing" })).toBe(false);
  });

  it("hides a tea with 0g left only when empties are switched off", () => {
    const empty = tea({ grams_remaining: 0 });
    expect(matches({ showEmpty: true }, empty)).toBe(true);
    expect(matches({ showEmpty: false }, empty)).toBe(false);
    expect(matches({ showEmpty: false })).toBe(true);
  });

  it("requires every set filter to match", () => {
    expect(matches({ nodeId: "oolong", country: "Taiwan" })).toBe(false);
  });
});
