import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LeafSheet from "./LeafSheet.vue";

describe("LeafSheet", () => {
  it("starts from the current grams and saves the edit", async () => {
    const wrapper = mount(LeafSheet, { props: { leafGrams: 6 } });
    const input = wrapper.get("[data-testid=leaf-grams]");
    expect((input.element as HTMLInputElement).value).toBe("6");
    await input.setValue("5,5");
    await wrapper.get("[data-testid=leaf-save]").trigger("click");
    expect(wrapper.emitted("save")![0]).toEqual([5.5]);
  });

  it("saves a cleared or invalid value as not recorded", async () => {
    const wrapper = mount(LeafSheet, { props: { leafGrams: 6 } });
    await wrapper.get("[data-testid=leaf-grams]").setValue("");
    await wrapper.get("[data-testid=leaf-save]").trigger("click");
    await wrapper.get("[data-testid=leaf-grams]").setValue("abc");
    await wrapper.get("[data-testid=leaf-save]").trigger("click");
    expect(wrapper.emitted("save")).toEqual([[null], [null]]);
  });

  it("cancels", async () => {
    const wrapper = mount(LeafSheet, { props: { leafGrams: null } });
    await wrapper.get("[data-testid=leaf-cancel]").trigger("click");
    expect(wrapper.emitted("cancel")).toHaveLength(1);
  });
});
