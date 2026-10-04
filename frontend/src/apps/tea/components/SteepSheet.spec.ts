import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SteepSheet from "./SteepSheet.vue";

describe("SteepSheet", () => {
  it("starts from the steep's time and saves plain seconds", async () => {
    const wrapper = mount(SteepSheet, { props: { number: 3, seconds: 95 } });
    expect(wrapper.text()).toContain("infusion 3");
    const input = wrapper.get("[data-testid=steep-seconds]");
    expect((input.element as HTMLInputElement).value).toBe("95");
    await input.setValue(" 40 ");
    await wrapper.get("[data-testid=steep-save]").trigger("click");
    expect(wrapper.emitted("save")![0]).toEqual([40]);
  });

  it("reads m:ss as minutes and seconds", async () => {
    const wrapper = mount(SteepSheet, { props: { number: 1, seconds: 20 } });
    await wrapper.get("[data-testid=steep-seconds]").setValue("1:30");
    await wrapper.get("[data-testid=steep-save]").trigger("click");
    expect(wrapper.emitted("save")![0]).toEqual([90]);
  });

  it("won't save a time it can't read", async () => {
    const wrapper = mount(SteepSheet, { props: { number: 1, seconds: 20 } });
    for (const bad of ["", "abc", "-5", "1:75", "2.5"]) {
      await wrapper.get("[data-testid=steep-seconds]").setValue(bad);
      expect(
        wrapper.get("[data-testid=steep-save]").attributes("disabled"),
      ).toBeDefined();
    }
  });

  it("takes a custom title", () => {
    const wrapper = mount(SteepSheet, {
      props: { number: 3, seconds: 20, title: "Target for infusion 3" },
    });
    expect(wrapper.get(".sheet__title").text()).toBe("Target for infusion 3");
  });

  it("cancels", async () => {
    const wrapper = mount(SteepSheet, { props: { number: 1, seconds: 20 } });
    await wrapper.get("[data-testid=steep-cancel]").trigger("click");
    expect(wrapper.emitted("cancel")).toHaveLength(1);
  });
});
