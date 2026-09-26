import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import TeaRow from "./TeaRow.vue";
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
    created_at: "2026-09-25T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
    ...overrides,
  };
}

function row(t: Tea, path = "Wuyi yancha", nameZh = "大紅袍") {
  return mount(TeaRow, { props: { tea: t, path, nameZh } });
}

describe("TeaRow", () => {
  it("shows the name", () => {
    expect(row(tea()).get('[data-testid="row-name"]').text()).toContain("Da Hong Pao");
  });

  it("shows the Chinese name marked as Chinese for screen readers", () => {
    const zh = row(tea()).get('[data-testid="row-zh"]');
    expect(zh.text()).toBe("大紅袍");
    expect(zh.attributes("lang")).toBe("zh");
  });

  it("omits the Chinese element when the node has none", () => {
    expect(row(tea(), "Wuyi yancha", "").find('[data-testid="row-zh"]').exists()).toBe(false);
  });

  it("shows the catalogue path", () => {
    expect(row(tea()).get('[data-testid="row-path"]').text()).toBe("Wuyi yancha");
  });

  it("emits open when the row is tapped", async () => {
    const wrapper = row(tea());
    await wrapper.get('[data-testid="row-body"]').trigger("click");
    expect(wrapper.emitted("open")?.[0]).toEqual(["t-1"]);
  });

  it("emits edit-grams when the rim is tapped, and does not also open the tea", async () => {
    const wrapper = row(tea());
    await wrapper.get('[data-testid="row-rim"]').trigger("click");
    expect(wrapper.emitted("edit-grams")?.[0]).toEqual(["t-1"]);
    expect(wrapper.emitted("open")).toBeUndefined();
  });

  it("marks an empty tea", () => {
    expect(row(tea({ grams_remaining: 0 })).get('[data-testid="row"]').classes()).toContain(
      "row--empty",
    );
  });

  it("keeps a very long name from pushing the rim off screen", () => {
    // Review Focus 4: the name truncates; the rim keeps its fixed column.
    const wrapper = row(tea({ name: "A".repeat(120) }));
    expect(wrapper.get('[data-testid="row-name"]').classes()).toContain("row__name--truncate");
    expect(wrapper.find('[data-testid="row-rim"]').exists()).toBe(true);
  });

  it("shows a thumbnail when the tea has a photo", () => {
    const wrapper = row(tea({ image_url: "https://example.com/photo.jpg" }));
    const img = wrapper.get('[data-testid="row-photo"]');
    expect(img.attributes("src")).toBe("https://example.com/photo.jpg");
  });

  it("omits the thumbnail when the tea has no photo", () => {
    expect(row(tea({ image_url: null })).find('[data-testid="row-photo"]').exists()).toBe(false);
  });
});
