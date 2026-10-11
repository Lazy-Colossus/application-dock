import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import NameDialog from "./NameDialog.vue";

const base = { title: "New room label", placeholder: "e.g. Living room" };

describe("NameDialog", () => {
  it("won't save blank text and emits it trimmed", async () => {
    const wrapper = mount(NameDialog, {
      props: { ...base, initial: "", canDelete: false },
    });
    expect(wrapper.text()).toContain("New room label");
    expect(
      wrapper.get("[data-testid=name-save]").attributes("disabled"),
    ).toBeDefined();
    await wrapper.get("[data-testid=name-text]").setValue("  Hall ");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("save")?.[0]).toEqual(["Hall"]);
    expect(wrapper.find("[data-testid=name-remove]").exists()).toBe(false);
  });

  it("offers Delete only when it can", async () => {
    const wrapper = mount(NameDialog, {
      props: {
        ...base,
        title: "Rename layout",
        initial: "Layout A",
        canDelete: true,
      },
    });
    expect(wrapper.text()).toContain("Rename layout");
    await wrapper.get("[data-testid=name-remove]").trigger("click");
    expect(wrapper.emitted("remove")).toHaveLength(1);
  });
});
