import { describe, it, expect } from "vitest";
import {
  MOODS,
  emptyChaXi,
  fromDateInput,
  gramsReturned,
  groupByMonth,
  hasChaXi,
  toDateInput,
  toggleMood,
} from "./journal";
import type { JournalEntry } from "./types";

function entry(id: string, started_at: string): JournalEntry {
  return {
    id,
    tea_id: "t-1",
    away_tea_name: "",
    away_class_id: null,
    status: "finalised",
    started_at,
    leaf_grams: null,
    water_temp_c: null,
    rating: null,
    curve_source: "generic",
    curve_source_label: "",
    infusions: [],
    teaware_id: null,
    timed: true,
    cha_xi: null,
    brewed_by: "jakub",
    vessel_volume_ml: null,
    updated_at: started_at,
    finished_at: started_at,
    image_url: null,
    tea_name: "Tieguanyin",
    class_id: "oolong",
    tea_image_url: null,
  };
}

describe("journal helpers", () => {
  it("keeps moods in the vocabulary's order when toggling", () => {
    expect(MOODS).toEqual([
      "calm",
      "bright",
      "contemplative",
      "cosy",
      "social",
      "focused",
      "tired",
      "restless",
    ]);
    expect(toggleMood(["social"], "calm")).toEqual(["calm", "social"]);
    expect(toggleMood(["calm", "social"], "calm")).toEqual(["social"]);
  });

  it("counts a sitting as cha xi once anything of it is recorded", () => {
    expect(hasChaXi({ cha_xi: null, image_url: null })).toBe(false);
    expect(hasChaXi({ cha_xi: emptyChaXi(), image_url: null })).toBe(false);
    expect(hasChaXi({ cha_xi: { ...emptyChaXi(), guests: "  " }, image_url: null })).toBe(false);
    expect(hasChaXi({ cha_xi: { ...emptyChaXi(), moods: ["calm"] }, image_url: null })).toBe(
      true,
    );
    expect(hasChaXi({ cha_xi: { ...emptyChaXi(), notes: "honey" }, image_url: null })).toBe(true);
    expect(hasChaXi({ cha_xi: null, image_url: "/api/tea/sessions/s-1/image" })).toBe(true);
  });

  it("groups newest-first entries by month", () => {
    const groups = groupByMonth([
      entry("a", "2026-09-28T18:00:00Z"),
      entry("b", "2026-09-02T18:00:00Z"),
      entry("c", "2026-08-30T18:00:00Z"),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["September 2026", "August 2026"]);
    expect(groups.map((g) => g.entries.map((e) => e.id))).toEqual([["a", "b"], ["c"]]);
  });

  it("gives grams back only for a cabinet tea", () => {
    expect(gramsReturned({ tea_id: "t-1", leaf_grams: 5 })).toBe(5);
    expect(gramsReturned({ tea_id: null, leaf_grams: 5 })).toBeNull();
    expect(gramsReturned({ tea_id: "t-1", leaf_grams: null })).toBeNull();
  });

  it("round-trips a picked day through local noon", () => {
    const iso = fromDateInput("2026-09-20");
    expect(new Date(iso).getHours()).toBe(12);
    expect(toDateInput(iso)).toBe("2026-09-20");
  });
});
