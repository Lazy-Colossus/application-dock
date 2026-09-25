import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ShelfSection from "./ShelfSection.vue";
import type { Tea } from "../types";

function tea(id: string, overrides: Partial<Tea> = {}): Tea {
  return {
    id,
    name: id,
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

function section(active = false) {
  return mount(ShelfSection, {
    props: {
      section: { classId: "oolong" as const, teas: [tea("t-1"), tea("t-2")] },
      index: 0,
      active,
      pathFor: () => "Wuyi yancha",
      nameZhFor: () => "大紅袍",
    },
  });
}

describe("ShelfSection", () => {
  it("names the class in English and Chinese", () => {
    const wrapper = section();
    expect(wrapper.get('[data-testid="section-name"]').text()).toBe("Oolong");
    expect(wrapper.get('[data-testid="section-zh"]').text()).toBe("烏龍");
  });

  it("renders a row per tea", () => {
    expect(section().findAll('[data-testid="row"]')).toHaveLength(2);
  });

  it("draws its leaves at full strength only when it is the section in view", () => {
    expect(section(true).get('[data-testid="section-leaves"]').classes()).toContain(
      "leaves--active",
    );
    expect(section(false).get('[data-testid="section-leaves"]').classes()).not.toContain(
      "leaves--active",
    );
  });

  it("passes a row's open event up", async () => {
    const wrapper = section();
    await wrapper.get('[data-testid="row-body"]').trigger("click");
    expect(wrapper.emitted("open")?.[0]).toEqual(["t-1"]);
  });
});
