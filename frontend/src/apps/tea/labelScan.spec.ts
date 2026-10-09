import { describe, it, expect } from "vitest";
import { labelScanPatch } from "./labelScan";
import type { LabelScanSuggestion, TeaWrite } from "./types";

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
    image_url: null,
    brewing: null,
  };
}

const full: LabelScanSuggestion = {
  name: "Da Hong Pao",
  catalogue_node_id: "oolong.wuyi",
  origin: "Wuyi Shan, Fujian",
  vendor: "Wuyi Origin",
  year: 2023,
  cultivar: "Qi Dan",
  grams: 100,
};

describe("labelScanPatch", () => {
  it("fills every empty field and lists what it filled", () => {
    const { change, filled } = labelScanPatch(blank(), full, false);
    expect(change).toEqual({
      name: "Da Hong Pao",
      catalogue_node_id: "oolong.wuyi",
      origin: "Wuyi Shan, Fujian",
      vendor: "Wuyi Origin",
      year: 2023,
      cultivar: "Qi Dan",
      grams_purchased: 100,
      grams_remaining: 100,
    });
    expect(filled).toEqual([
      "name",
      "category",
      "origin",
      "vendor",
      "year",
      "cultivar",
      "grams",
    ]);
  });

  it("never overwrites something already there", () => {
    const draft = {
      ...blank(),
      name: "My name",
      catalogue_node_id: "green",
      vendor: "My shop",
      year: 2020,
      grams_purchased: 50,
      grams_remaining: 20,
    };
    const { change, filled } = labelScanPatch(draft, full, false);
    expect(change).toEqual({ origin: "Wuyi Shan, Fujian", cultivar: "Qi Dan" });
    expect(filled).toEqual(["origin", "cultivar"]);
  });

  it("leaves origin alone once the person has typed in it, even if they cleared it", () => {
    const { change } = labelScanPatch(blank(), full, true);
    expect(change.origin).toBeUndefined();
  });

  it("sets grams purchased but keeps a non-zero grams remaining", () => {
    const { change } = labelScanPatch(
      { ...blank(), grams_remaining: 30 },
      full,
      false,
    );
    expect(change.grams_purchased).toBe(100);
    expect(change.grams_remaining).toBeUndefined();
  });

  it("returns nothing for an empty suggestion", () => {
    const empty: LabelScanSuggestion = {
      name: "",
      catalogue_node_id: null,
      origin: "",
      vendor: "",
      year: null,
      cultivar: "",
      grams: null,
    };
    expect(labelScanPatch(blank(), empty, false)).toEqual({
      change: {},
      filled: [],
    });
  });
});
