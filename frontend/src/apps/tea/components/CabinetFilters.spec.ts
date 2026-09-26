import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import CabinetFilters from "./CabinetFilters.vue";
import { useTeaCabinetFiltersStore } from "../stores/useTeaCabinetFiltersStore";
import type { CatalogueNode, Tea } from "../types";

beforeEach(() => {
  setActivePinia(createPinia());
});

function node(id: string, parent_id: string | null): CatalogueNode {
  return { id, parent_id, name: id, name_zh: "", source: "seed", default_origin: "" };
}

const NODES = [
  node("oolong", null),
  node("oolong.wuyi", "oolong"),
  node("oolong.anxi", "oolong"),
  node("green", null),
  node("white", null),
];

function tea(id: string, catalogue_node_id: string): Tea {
  return {
    id,
    name: id,
    catalogue_node_id,
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
  };
}

const TEAS = [tea("a", "oolong.wuyi"), tea("b", "green")];
const COUNTRIES: Record<string, string> = { a: "China", b: "Taiwan" };

function sheet(matchCount = 2) {
  return mount(CabinetFilters, {
    props: {
      teas: TEAS,
      nodes: NODES,
      countryFor: (t: Tea) => COUNTRIES[t.id] ?? null,
      matchCount,
    },
  });
}

describe("CabinetFilters", () => {
  it("offers only classes that some tea in the cabinet belongs to", () => {
    const wrapper = sheet();
    expect(wrapper.find('[data-testid="filter-node-oolong"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="filter-node-green"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="filter-node-white"]').exists()).toBe(false);
  });

  it("opens the next tier with only the kinds actually owned", async () => {
    const wrapper = sheet();
    await wrapper.get('[data-testid="filter-node-oolong"]').trigger("click");

    expect(useTeaCabinetFiltersStore().nodeId).toBe("oolong");
    expect(wrapper.findAll('[data-testid="filter-tier"]')).toHaveLength(2);
    expect(wrapper.find('[data-testid="filter-node-oolong.wuyi"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="filter-node-oolong.anxi"]').exists()).toBe(false);
  });

  it("tapping a chosen pill again steps back up to its parent", async () => {
    const wrapper = sheet();
    await wrapper.get('[data-testid="filter-node-oolong"]').trigger("click");
    await wrapper.get('[data-testid="filter-node-oolong.wuyi"]').trigger("click");
    expect(useTeaCabinetFiltersStore().nodeId).toBe("oolong.wuyi");

    await wrapper.get('[data-testid="filter-node-oolong.wuyi"]').trigger("click");
    expect(useTeaCabinetFiltersStore().nodeId).toBe("oolong");

    await wrapper.get('[data-testid="filter-node-oolong"]').trigger("click");
    expect(useTeaCabinetFiltersStore().nodeId).toBeNull();
  });

  it("offers the countries of the teas owned, and toggles one", async () => {
    const wrapper = sheet();
    await wrapper.get('[data-testid="filter-country-Taiwan"]').trigger("click");
    expect(useTeaCabinetFiltersStore().country).toBe("Taiwan");

    await wrapper.get('[data-testid="filter-country-Taiwan"]').trigger("click");
    expect(useTeaCabinetFiltersStore().country).toBeNull();
  });

  it("binds the name search and the empty-tea checkbox", async () => {
    const wrapper = sheet();
    await wrapper.get('[data-testid="filter-query"]').setValue("hong");
    await wrapper.get('[data-testid="filter-show-empty"]').setValue(false);

    const filters = useTeaCabinetFiltersStore();
    expect(filters.query).toBe("hong");
    expect(filters.showEmpty).toBe(false);
  });

  it("says how many teas the shelf will show", () => {
    expect(sheet(1).get('[data-testid="filters-done"]').text()).toBe("Show 1 tea");
  });

  it("offers Clear only once something is filtered, and it resets everything", async () => {
    const wrapper = sheet();
    expect(wrapper.find('[data-testid="filters-clear"]').exists()).toBe(false);

    await wrapper.get('[data-testid="filter-country-China"]').trigger("click");
    await wrapper.get('[data-testid="filters-clear"]').trigger("click");

    const filters = useTeaCabinetFiltersStore();
    expect(filters.country).toBeNull();
    expect(filters.activeCount).toBe(0);
  });

  it("closes from Done and from the scrim", async () => {
    const wrapper = sheet();
    await wrapper.get('[data-testid="filters-done"]').trigger("click");
    await wrapper.get('[data-testid="filters-scrim"]').trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(2);
  });
});
