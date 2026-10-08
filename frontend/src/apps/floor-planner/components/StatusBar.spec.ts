import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import StatusBar from "./StatusBar.vue";

describe("StatusBar", () => {
  const base = {
    hover: null,
    readout: null,
    dirty: false,
    saving: false,
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

  it("offers Save and Discard only when there are unsaved changes", async () => {
    const wrapper = mount(StatusBar, { props: base });
    expect(wrapper.find("[data-testid=save]").exists()).toBe(false);
    await wrapper.setProps({ dirty: true });
    await wrapper.get("[data-testid=save]").trigger("click");
    expect(wrapper.emitted("save")).toHaveLength(1);
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
