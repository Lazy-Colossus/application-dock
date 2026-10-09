import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import ShelfSection from "./ShelfSection.vue";
import type { Tea } from "../types";

beforeEach(() => {
  setActivePinia(createPinia());
});

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
    image_url: null,
    brewing: null,
    created_at: "2026-09-25T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
    ...overrides,
  };
}

function section(active = false, teas: Tea[] = [tea("t-1"), tea("t-2")]) {
  return mount(ShelfSection, {
    props: {
      section: { classId: "oolong" as const, teas },
      index: 0,
      active,
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

  it("lays its teas out as cards in one horizontal strip", () => {
    const strip = section().get('[data-testid="section-strip"]');
    expect(strip.findAll('[data-testid="card"]')).toHaveLength(2);
  });

  it("draws its leaves at full strength only when it is the section in view", () => {
    expect(section(true).get('[data-testid="section-leaves"]').classes()).toContain(
      "leaves--active",
    );
    expect(section(false).get('[data-testid="section-leaves"]').classes()).not.toContain(
      "leaves--active",
    );
  });

  it("passes a card's open event up", async () => {
    const wrapper = section();
    await wrapper.get('[data-testid="card"]').trigger("click");
    expect(wrapper.emitted("open")?.[0]).toEqual(["t-1"]);
  });

  it("keeps up to 6 teas on one row", () => {
    const teas = Array.from({ length: 6 }, (_, i) => tea(`t-${i}`));
    expect(section(false, teas).get('[data-testid="section-strip"]').classes()).not.toContain(
      "section__strip--two-rows",
    );
  });

  it("splits more than 6 teas across two rows", () => {
    const teas = Array.from({ length: 7 }, (_, i) => tea(`t-${i}`));
    expect(section(false, teas).get('[data-testid="section-strip"]').classes()).toContain(
      "section__strip--two-rows",
    );
  });
});
