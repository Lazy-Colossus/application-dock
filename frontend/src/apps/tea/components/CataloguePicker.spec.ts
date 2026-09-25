import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import CataloguePicker from "./CataloguePicker.vue";
import type { CatalogueNode } from "../types";

function node(
  id: string,
  parent_id: string | null,
  overrides: Partial<CatalogueNode> = {},
): CatalogueNode {
  return {
    id,
    parent_id,
    name: id,
    name_zh: "",
    source: "seed",
    default_origin: "",
    ...overrides,
  };
}

const nodes: CatalogueNode[] = [
  node("oolong", null, { name: "Oolong", name_zh: "烏龍" }),
  node("oolong.wuyi", "oolong", { name: "Wuyi yancha", default_origin: "Wuyi Shan, Fujian" }),
  node("oolong.wuyi.dhp", "oolong.wuyi", { name: "Da Hong Pao", name_zh: "大紅袍" }),
  node("oolong.wuyi.rg", "oolong.wuyi", { name: "Rou Gui" }),
  node("green", null, { name: "Green", name_zh: "綠茶" }),
];

const picker = (modelValue: string | null = null) =>
  mount(CataloguePicker, { props: { nodes, modelValue } });

describe("CataloguePicker", () => {
  it("shows one chip per class and nothing deeper until you choose", () => {
    const wrapper = picker();
    expect(wrapper.findAll('[data-testid="tier"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-testid^="chip-"]').length).toBe(2);
  });

  it("reveals the next tier once a class with children is chosen", async () => {
    const wrapper = picker();
    await wrapper.get('[data-testid="chip-oolong"]').trigger("click");
    expect(wrapper.findAll('[data-testid="tier"]')).toHaveLength(2);
  });

  it("stops when the chosen node has no children", async () => {
    const wrapper = picker("oolong.wuyi.dhp");
    // class, kind, which — and no fourth tier below a leaf.
    expect(wrapper.findAll('[data-testid="tier"]')).toHaveLength(3);
  });

  it("emits the chosen node id", async () => {
    const wrapper = picker();
    await wrapper.get('[data-testid="chip-green"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["green"]);
  });

  it("marks the chosen chip at every tier", () => {
    const wrapper = picker("oolong.wuyi");
    expect(wrapper.get('[data-testid="chip-oolong"]').classes()).toContain("chip--on");
    expect(wrapper.get('[data-testid="chip-oolong.wuyi"]').classes()).toContain("chip--on");
  });

  it("offers to add one at every tier below the first", async () => {
    const wrapper = picker("oolong");
    const adds = wrapper.findAll('[data-testid^="add-"]');
    expect(adds.length).toBeGreaterThan(0);
    await adds[0].trigger("click");
    expect(wrapper.emitted("add-node")?.[0]).toEqual(["oolong"]);
  });

  it("does not offer to add a class", () => {
    expect(picker().find('[data-testid="add-null"]').exists()).toBe(false);
  });

  it("announces the prefill before it happens", async () => {
    const wrapper = picker();
    await wrapper.get('[data-testid="chip-oolong"]').trigger("click");
    await wrapper.setProps({ modelValue: "oolong.wuyi.dhp" });
    expect(wrapper.get('[data-testid="picker-prefill"]').text()).toContain("Wuyi Shan, Fujian");
    expect(wrapper.get('[data-testid="picker-prefill"]').text()).toContain("you can change it");
  });

  it("says nothing about prefill when no ancestor offers an origin", async () => {
    const wrapper = picker("green");
    expect(wrapper.find('[data-testid="picker-prefill"]').exists()).toBe(false);
  });

  it("emits the prefill origin when a node is chosen", async () => {
    const wrapper = picker("oolong.wuyi");
    await wrapper.get('[data-testid="chip-oolong.wuyi.dhp"]').trigger("click");
    expect(wrapper.emitted("prefill")?.[0]).toEqual(["Wuyi Shan, Fujian"]);
  });

  it("keeps two same-named siblings separately selectable", async () => {
    // Review Focus 5: duplicates are permitted and must stay distinguishable.
    const dupes = [
      ...nodes,
      node("u-1", "oolong.wuyi", { name: "Rou Gui", source: "user" }),
    ];
    const wrapper = mount(CataloguePicker, {
      props: { nodes: dupes, modelValue: "oolong.wuyi" },
    });
    expect(wrapper.find('[data-testid="chip-oolong.wuyi.rg"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="chip-u-1"]').exists()).toBe(true);

    await wrapper.get('[data-testid="chip-u-1"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["u-1"]);
  });
});
