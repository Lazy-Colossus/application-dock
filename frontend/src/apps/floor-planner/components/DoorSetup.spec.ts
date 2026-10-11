import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import DoorSetup from "./DoorSetup.vue";
import type { Door } from "../doors";

const door: Door = {
  key: "3,2",
  code: "dr",
  col: 3,
  row: 2,
  cols: 4,
  rows: 1,
  dir: "h",
  setting: { col: 3, row: 2, into: 0, hinge: 0, double: false },
};

function setup(over: Partial<Door> = {}, open = true) {
  return mount(DoorSetup, {
    props: {
      door: { ...door, ...over },
      sides: ["Hall", "Bedroom"] as [string, string],
      open,
    },
  });
}

describe("DoorSetup", () => {
  it("names the door, its width and the rooms on each side", () => {
    const wrapper = setup();
    expect(wrapper.text()).toContain("Door · 80 cm");
    expect(wrapper.get("[data-testid=door-into-1]").text()).toBe("Bedroom");
    expect(
      setup({ code: "fd" }).get("[data-testid=door-setup]").text(),
    ).toContain("Front door");
  });

  it("changes the side, hinge and leaves as one setting each", async () => {
    const wrapper = setup();
    await wrapper.get("[data-testid=door-into-1]").trigger("click");
    await wrapper.get("[data-testid=door-hinge-1]").trigger("click");
    await wrapper.get("[data-testid=door-double]").trigger("click");
    expect(wrapper.emitted("update")).toEqual([
      [{ ...door.setting, into: 1 }],
      [{ ...door.setting, hinge: 1 }],
      [{ ...door.setting, double: true }],
    ]);
  });

  it("drops the hinge choice for a double door", () => {
    const wrapper = setup({ setting: { ...door.setting, double: true } });
    expect(wrapper.find("[data-testid=door-hinge-0]").exists()).toBe(false);
  });

  it("names the hinge ends by the wall's direction", () => {
    expect(setup({ dir: "v" }).get("[data-testid=door-hinge-0]").text()).toBe(
      "Top",
    );
  });

  it("shows the door open or closed, and closes", async () => {
    const wrapper = setup({}, true);
    await wrapper.get("[data-testid=door-show-closed]").trigger("click");
    await wrapper.get("[data-testid=door-setup-close]").trigger("click");
    expect(wrapper.emitted("open")).toEqual([[false]]);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
