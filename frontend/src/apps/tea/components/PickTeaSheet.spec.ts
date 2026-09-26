import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/composables/useApi", () => ({ ApiError: class extends Error {}, api: {} }));

import PickTeaSheet from "./PickTeaSheet.vue";
import type { Tea } from "../types";

function tea(id: string, name: string, grams: number): Tea {
  return {
    id,
    name,
    catalogue_node_id: "oolong",
    class_id: "oolong",
    form: null,
    origin: "",
    vendor: "",
    year: null,
    harvest_season: null,
    cultivar: "",
    grams_purchased: null,
    grams_remaining: grams,
    price_paid: null,
    purchase_date: null,
    storage_location: "",
    low_threshold_grams: null,
    notes: "",
    image_url: null,
    brewing: null,
    created_at: "2026-09-25T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
  };
}

const TEAS = [tea("t-a", "Rou Gui", 0), tea("t-b", "Tieguanyin", 42), tea("t-c", "Bai Hao", 10)];

function sheet(currentTeaId: string | null = null) {
  setActivePinia(createPinia());
  return mount(PickTeaSheet, {
    props: { teas: TEAS, currentTeaId, leafGrams: 6, waterTempC: 95 },
  });
}

describe("PickTeaSheet", () => {
  it("lists teas with leaf first, empty ones last", () => {
    const ids = sheet()
      .findAll("[data-testid^=pick-tea-]")
      .map((el) => el.attributes("data-testid"));
    expect(ids).toEqual(["pick-tea-t-c", "pick-tea-t-b", "pick-tea-t-a"]);
  });

  it("filters by name and emits the pick", async () => {
    const wrapper = sheet();
    await wrapper.get("[data-testid=pick-search]").setValue("tie");
    const rows = wrapper.findAll("[data-testid^=pick-tea-]");
    expect(rows).toHaveLength(1);
    await rows[0].trigger("click");
    expect(wrapper.emitted("pick")![0][0]).toMatchObject({ id: "t-b" });
  });

  it("offers grams and temperature only once a tea is attached", async () => {
    expect(sheet().find("[data-testid=pick-grams]").exists()).toBe(false);
    const attached = sheet("t-b");
    await attached.get("[data-testid=pick-grams]").setValue("7");
    await attached.get("[data-testid=pick-temp]").setValue("");
    expect(attached.emitted("update-grams")![0]).toEqual([7]);
    expect(attached.emitted("update-temp")![0]).toEqual([null]);
  });
});
