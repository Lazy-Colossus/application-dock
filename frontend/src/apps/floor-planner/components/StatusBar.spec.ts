import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import StatusBar from "./StatusBar.vue";

describe("StatusBar", () => {
  const base = {
    hover: null,
    readout: null,
    saveState: null,
    zoom: 1,
  };

  it("shows the cursor in metres", () => {
    const wrapper = mount(StatusBar, {
      props: { ...base, hover: { col: 34, row: 17 } },
    });
    expect(wrapper.get("[data-testid=status-cursor]").text()).toBe(
      "6.80 m, 3.40 m",
    );
  });

  it("shows the save state, offering Save now only while unsaved", async () => {
    const wrapper = mount(StatusBar, { props: base });
    expect(wrapper.find("[data-testid=save-state]").exists()).toBe(false);
    await wrapper.setProps({ saveState: "unsaved" });
    expect(wrapper.get("[data-testid=save-state]").text()).toBe("Unsaved");
    await wrapper.get("[data-testid=save]").trigger("click");
    expect(wrapper.emitted("save")).toHaveLength(1);
    await wrapper.setProps({ saveState: "saved" });
    expect(wrapper.get("[data-testid=save-state]").text()).toBe("Saved");
    expect(wrapper.find("[data-testid=save]").exists()).toBe(false);
  });

  it("steps through zoom levels and stops at the ends", async () => {
    const wrapper = mount(StatusBar, { props: { ...base, zoom: 2 } });
    expect(
      wrapper.get("[data-testid=zoom-in]").attributes("disabled"),
    ).toBeDefined();
    await wrapper.get("[data-testid=zoom-out]").trigger("click");
    expect(wrapper.emitted("update:zoom")?.[0][0]).toBe(1.5);
  });

  it("puts slot content, the layout tabs, at the start", () => {
    const wrapper = mount(StatusBar, {
      props: base,
      slots: { default: '<span data-testid="tabs">Layout A</span>' },
    });
    expect(
      wrapper.find("[data-testid=status-bar] > [data-testid=tabs]").exists(),
    ).toBe(true);
  });
});
