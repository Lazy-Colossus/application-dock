import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LayoutTabs from "./LayoutTabs.vue";

const a = { id: "l_a", name: "Layout A", placements: [] };
const b = { id: "l_b", name: "Layout B", placements: [] };

describe("LayoutTabs", () => {
  it("marks the active tab and emits each action", async () => {
    const wrapper = mount(LayoutTabs, {
      props: { layouts: [a, b], activeId: "l_b" },
    });
    expect(
      wrapper.get("[data-testid=layout-l_b]").attributes("aria-selected"),
    ).toBe("true");
    expect(
      wrapper.get("[data-testid=layout-l_a]").attributes("aria-selected"),
    ).toBe("false");
    await wrapper.get("[data-testid=layout-l_a]").trigger("click");
    for (const action of ["create", "duplicate", "rename", "delete"]) {
      await wrapper.get(`[data-testid=layout-${action}]`).trigger("click");
    }
    expect(wrapper.emitted("select")?.[0]).toEqual(["l_a"]);
    expect(wrapper.emitted("create")).toHaveLength(1);
    expect(wrapper.emitted("duplicate")).toHaveLength(1);
    expect(wrapper.emitted("rename")).toHaveLength(1);
    expect(wrapper.emitted("remove")).toHaveLength(1);
  });

  it("can't delete the only layout", () => {
    const wrapper = mount(LayoutTabs, {
      props: { layouts: [a], activeId: "l_a" },
    });
    expect(
      wrapper.get("[data-testid=layout-delete]").attributes("disabled"),
    ).toBeDefined();
  });
});
