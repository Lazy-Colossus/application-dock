import { describe, it, expect } from "vitest";
import { canSaveTea } from "./validation";
import type { TeaWrite } from "./types";

function blank(): TeaWrite {
  return {
    name: "",
    catalogue_node_id: "",
    form: null,
    origin: "",
    vendor: "",
    year: null,
    harvest_season: null,
    cultivar: "",
    grams_purchased: null,
    grams_remaining: 0,
    price_paid: null,
    purchase_date: null,
    storage_location: "",
    low_threshold_grams: null,
    notes: "",
  };
}

describe("canSaveTea", () => {
  it("refuses a blank name and classification", () => {
    expect(canSaveTea(blank())).toBe(false);
  });

  it("refuses a name with no classification", () => {
    expect(canSaveTea({ ...blank(), name: "Da Hong Pao" })).toBe(false);
  });

  it("refuses a classification with no name", () => {
    expect(canSaveTea({ ...blank(), catalogue_node_id: "oolong" })).toBe(false);
  });

  it("refuses a name that is only whitespace", () => {
    expect(canSaveTea({ ...blank(), name: "   ", catalogue_node_id: "oolong" })).toBe(false);
  });

  it("accepts a name and a classification", () => {
    expect(canSaveTea({ ...blank(), name: "Da Hong Pao", catalogue_node_id: "oolong" })).toBe(
      true,
    );
  });
});
