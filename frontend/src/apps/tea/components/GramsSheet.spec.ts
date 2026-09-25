import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import GramsSheet from "./GramsSheet.vue";
import type { Tea } from "../types";

function tea(overrides: Partial<Tea> = {}): Tea {
  return {
    id: "t-1",
    name: "Da Hong Pao",
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
    created_at: "2026-09-25T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
    ...overrides,
  };
}

const sheet = (t: Tea = tea()) => mount(GramsSheet, { props: { tea: t } });

describe("GramsSheet", () => {
  it("opens at the tea's current amount", () => {
    expect(sheet().get('[data-testid="grams-value"]').text()).toContain("38");
  });

  it("steps down by one gram", async () => {
    const wrapper = sheet();
    await wrapper.get('[data-testid="grams-minus"]').trigger("click");
    expect(wrapper.get('[data-testid="grams-value"]').text()).toContain("37");
  });

  it("steps up by one gram", async () => {
    const wrapper = sheet();
    await wrapper.get('[data-testid="grams-plus"]').trigger("click");
    expect(wrapper.get('[data-testid="grams-value"]').text()).toContain("39");
  });

  it("never goes below zero", async () => {
    const wrapper = sheet(tea({ grams_remaining: 0 }));
    await wrapper.get('[data-testid="grams-minus"]').trigger("click");
    expect(wrapper.get('[data-testid="grams-value"]').text()).toContain("0");
  });

  it("will not step past what was bought", async () => {
    const wrapper = sheet(tea({ grams_purchased: 39, grams_remaining: 38 }));
    await wrapper.get('[data-testid="grams-plus"]').trigger("click");
    await wrapper.get('[data-testid="grams-plus"]').trigger("click");
    expect(wrapper.get('[data-testid="grams-value"]').text()).toContain("39");
  });

  it("steps freely when the amount bought is unknown", async () => {
    const wrapper = sheet(tea({ grams_purchased: null, grams_remaining: 900 }));
    await wrapper.get('[data-testid="grams-plus"]').trigger("click");
    expect(wrapper.get('[data-testid="grams-value"]').text()).toContain("901");
  });

  it("says where you started, so a mis-tap is obvious", () => {
    expect(sheet().get('[data-testid="grams-hint"]').text()).toContain("was 38g");
  });

  it("emits the new amount on save", async () => {
    const wrapper = sheet();
    await wrapper.get('[data-testid="grams-minus"]').trigger("click");
    await wrapper.get('[data-testid="grams-save"]').trigger("click");
    expect(wrapper.emitted("save")?.[0]).toEqual([37]);
  });

  it("emits cancel and no save when dismissed", async () => {
    const wrapper = sheet();
    await wrapper.get('[data-testid="grams-cancel"]').trigger("click");
    expect(wrapper.emitted("cancel")).toBeTruthy();
    expect(wrapper.emitted("save")).toBeUndefined();
  });
});
