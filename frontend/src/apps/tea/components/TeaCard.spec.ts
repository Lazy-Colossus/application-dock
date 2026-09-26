import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import TeaCard from "./TeaCard.vue";
import type { Tea } from "../types";

beforeEach(() => {
  setActivePinia(createPinia());
});

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
    brewing: null,
    created_at: "2026-09-25T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
    ...overrides,
  };
}

function card(t: Tea, nameZh = "大紅袍") {
  return mount(TeaCard, { props: { tea: t, nameZh } });
}

describe("TeaCard", () => {
  it("shows the name under the picture", () => {
    expect(card(tea()).get('[data-testid="card-name"]').text()).toBe("Da Hong Pao");
  });

  it("shows the photo when the tea has one", () => {
    const wrapper = card(tea({ image_url: "https://example.com/photo.jpg" }));
    expect(wrapper.get('[data-testid="card-photo"]').attributes("src")).toBe(
      "https://example.com/photo.jpg",
    );
    expect(wrapper.find('[data-testid="card-placeholder"]').exists()).toBe(false);
  });

  it("stands in the first Chinese character when there is no photo", () => {
    const placeholder = card(tea()).get('[data-testid="card-placeholder"]');
    expect(placeholder.text()).toBe("大");
    expect(placeholder.attributes("lang")).toBe("zh");
  });

  it("falls back to the name's first letter when there is no Chinese name either", () => {
    expect(card(tea(), "").get('[data-testid="card-placeholder"]').text()).toBe("D");
  });

  it("draws how much is left as a share of what was bought", () => {
    const stock = card(tea()).get('[data-testid="card-stock"]');
    expect(stock.attributes("style")).toContain("width: 38%");
  });

  it("draws no stock line when the bought amount is unknown", () => {
    expect(
      card(tea({ grams_purchased: null }))
        .find('[data-testid="card-stock"]')
        .exists(),
    ).toBe(false);
  });

  it("marks an empty tea", () => {
    expect(
      card(tea({ grams_remaining: 0 }))
        .get('[data-testid="card"]')
        .classes(),
    ).toContain("card--empty");
  });

  it("emits open when tapped", async () => {
    const wrapper = card(tea());
    await wrapper.get('[data-testid="card"]').trigger("click");
    expect(wrapper.emitted("open")?.[0]).toEqual(["t-1"]);
  });
});
