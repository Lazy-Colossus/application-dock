import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TeaForm from "./TeaForm.vue";
import type { CatalogueNode, TeaWrite } from "../types";

const nodes: CatalogueNode[] = [
  {
    id: "oolong",
    parent_id: null,
    name: "Oolong",
    name_zh: "烏龍",
    source: "seed",
    default_origin: "",
  },
  {
    id: "oolong.wuyi",
    parent_id: "oolong",
    name: "Wuyi yancha",
    name_zh: "",
    source: "seed",
    default_origin: "Wuyi Shan, Fujian",
  },
];

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

const form = (value: TeaWrite = blank()) =>
  mount(TeaForm, { props: { modelValue: value, nodes } });

describe("TeaForm", () => {
  it("groups the fields under the three headings", () => {
    const headings = form()
      .findAll('[data-testid="group"]')
      .map((h) => h.text());
    expect(headings).toEqual(["Where it's from", "What it cost", "On the shelf"]);
  });

  it("emits the typed name", async () => {
    const wrapper = form();
    await wrapper.get('[data-testid="field-name"]').setValue("Rou Gui");
    const last = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as TeaWrite;
    expect(last.name).toBe("Rou Gui");
  });

  it("fills an untouched origin from the picked node", async () => {
    const wrapper = form();
    await wrapper.getComponent({ name: "CataloguePicker" }).vm.$emit("prefill", "Wuyi Shan, Fujian");
    const last = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as TeaWrite;
    expect(last.origin).toBe("Wuyi Shan, Fujian");
  });

  it("refuses to overwrite an origin the person typed", async () => {
    const wrapper = form({ ...blank(), origin: "A shop in Prague" });
    await wrapper.get('[data-testid="field-origin"]').setValue("A shop in Prague");
    await wrapper.getComponent({ name: "CataloguePicker" }).vm.$emit("prefill", "Wuyi Shan, Fujian");
    const last = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as TeaWrite;
    expect(last.origin).toBe("A shop in Prague");
  });

  it("shows price per gram when both numbers are known", () => {
    const wrapper = form({ ...blank(), price_paid: 68, grams_purchased: 100 });
    expect(wrapper.get('[data-testid="price-per-gram"]').text()).toContain("0.68");
  });

  it("shows no price per gram when the amount bought is zero", () => {
    const wrapper = form({ ...blank(), price_paid: 68, grams_purchased: 0 });
    expect(wrapper.find('[data-testid="price-per-gram"]').exists()).toBe(false);
  });
});
