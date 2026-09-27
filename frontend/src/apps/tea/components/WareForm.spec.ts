import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import WareForm from "./WareForm.vue";
import { blankWare } from "../ware";
import type { CatalogueNode, TeawareWrite } from "../types";

const NODES: CatalogueNode[] = [
  { id: "oolong", parent_id: null, name: "Oolong", name_zh: "烏龍", source: "seed", default_origin: "" },
];

function form(value: Partial<TeawareWrite> = {}) {
  return mount(WareForm, { props: { modelValue: { ...blankWare(), ...value }, nodes: NODES } });
}

function lastEmit(wrapper: ReturnType<typeof form>): TeawareWrite {
  const events = wrapper.emitted("update:modelValue") ?? [];
  return events[events.length - 1][0] as TeawareWrite;
}

describe("WareForm", () => {
  it("edits the name and turns an empty material back into not-recorded", async () => {
    const wrapper = form({ material: "clay" });
    await wrapper.get("[data-testid=ware-field-name]").setValue("Zhuni");
    expect(lastEmit(wrapper).name).toBe("Zhuni");
    await wrapper.get("[data-testid=ware-field-material]").setValue("");
    expect(lastEmit(wrapper).material).toBeNull();
  });

  it("keeps a volume only when it is a whole number above zero", async () => {
    const wrapper = form();
    await wrapper.get("[data-testid=ware-field-volume]").setValue("110");
    expect(lastEmit(wrapper).volume_ml).toBe(110);
    await wrapper.get("[data-testid=ware-field-volume]").setValue("0");
    expect(lastEmit(wrapper).volume_ml).toBeNull();
  });

  it("offers a dedication only for a pot that seasons", () => {
    expect(form().find("[data-testid=picker]").exists()).toBe(false);
    expect(form({ porous: true }).find("[data-testid=picker]").exists()).toBe(true);
    expect(form({ porous: true }).find("[data-testid=picker-prefill]").exists()).toBe(false);
  });

  it("unchecking porous clears the dedication", async () => {
    const wrapper = form({ porous: true, dedicated_node_id: "oolong" });
    await wrapper.get("[data-testid=ware-field-porous]").setValue(false);
    expect(lastEmit(wrapper)).toMatchObject({ porous: false, dedicated_node_id: null });
  });
});
