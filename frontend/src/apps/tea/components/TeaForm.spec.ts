import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: vi.fn(), post: postMock, put: vi.fn(), del: vi.fn() },
}));

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

beforeEach(() => {
  setActivePinia(createPinia());
  postMock.mockReset();
});

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

  it("has no input for grams left — the grams sheet is the only way that changes", () => {
    expect(form().find('[data-testid="field-remaining"]').exists()).toBe(false);
  });

  it("round-trips a chosen form into the emitted write", async () => {
    const wrapper = form();
    await wrapper.get('[data-testid="field-form"]').setValue("cake");
    const last = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as TeaWrite;
    expect(last.form).toBe("cake");
  });

  it("clears form back to null when the empty option is chosen", async () => {
    const wrapper = form({ ...blank(), form: "cake" });
    await wrapper.get('[data-testid="field-form"]').setValue("");
    const last = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as TeaWrite;
    expect(last.form).toBeNull();
  });

  it("round-trips a chosen harvest season into the emitted write", async () => {
    const wrapper = form();
    await wrapper.get('[data-testid="field-harvest-season"]').setValue("spring");
    const last = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as TeaWrite;
    expect(last.harvest_season).toBe("spring");
  });

  it("clears harvest season back to null when the empty option is chosen", async () => {
    const wrapper = form({ ...blank(), harvest_season: "spring" });
    await wrapper.get('[data-testid="field-harvest-season"]').setValue("");
    const last = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as TeaWrite;
    expect(last.harvest_season).toBeNull();
  });

  it("disables the autofill button while the name is empty", () => {
    const wrapper = form();
    expect(wrapper.get('[data-testid="autofill"]').attributes("disabled")).toBeDefined();
  });

  it("applies the suggested category and origin on autofill", async () => {
    postMock.mockResolvedValue({
      catalogue_node_id: "oolong.wuyi-yancha.da-hong-pao",
      origin: "Wuyi Shan, Fujian",
    });
    const wrapper = form({ ...blank(), name: "Da Hong Pao" });

    await wrapper.get('[data-testid="autofill"]').trigger("click");
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith("/tea/autofill", { name: "Da Hong Pao" });
    const last = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as TeaWrite;
    expect(last.catalogue_node_id).toBe("oolong.wuyi-yancha.da-hong-pao");
    expect(last.origin).toBe("Wuyi Shan, Fujian");
  });

  it("never overwrites an origin the person already typed, even from autofill", async () => {
    postMock.mockResolvedValue({
      catalogue_node_id: "oolong.wuyi-yancha.da-hong-pao",
      origin: "Wuyi Shan, Fujian",
    });
    const wrapper = form({ ...blank(), name: "Da Hong Pao", origin: "A shop in Prague" });

    await wrapper.get('[data-testid="autofill"]').trigger("click");
    await flushPromises();

    const last = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as TeaWrite;
    expect(last.origin).toBe("A shop in Prague");
  });

  it("shows a message when Jev isn't confident about the name", async () => {
    postMock.mockResolvedValue(null);
    const wrapper = form({ ...blank(), name: "some tea" });

    await wrapper.get('[data-testid="autofill"]').trigger("click");
    await flushPromises();

    expect(wrapper.get('[data-testid="autofill-message"]').text()).toContain("pick a category");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("shows the real error when autofill fails outright", async () => {
    postMock.mockRejectedValue(
      Object.assign(new Error("down"), { detail: "Autofill is not configured on this server" }),
    );
    const wrapper = form({ ...blank(), name: "Da Hong Pao" });

    await wrapper.get('[data-testid="autofill"]').trigger("click");
    await flushPromises();

    expect(wrapper.get('[data-testid="autofill-message"]').text()).toContain("not configured");
  });
});
