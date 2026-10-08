import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LabelDialog from "./LabelDialog.vue";

describe("LabelDialog", () => {
  it("won't save blank text and emits it trimmed", async () => {
    const wrapper = mount(LabelDialog, {
      props: { initial: "", editing: false },
    });
    expect(
      wrapper.get("[data-testid=label-save]").attributes("disabled"),
    ).toBeDefined();
    await wrapper.get("[data-testid=label-text]").setValue("  Hall ");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("save")?.[0]).toEqual(["Hall"]);
    expect(wrapper.find("[data-testid=label-remove]").exists()).toBe(false);
  });

  it("offers Delete when editing", async () => {
    const wrapper = mount(LabelDialog, {
      props: { initial: "Hall", editing: true },
    });
    await wrapper.get("[data-testid=label-remove]").trigger("click");
    expect(wrapper.emitted("remove")).toHaveLength(1);
  });
});
