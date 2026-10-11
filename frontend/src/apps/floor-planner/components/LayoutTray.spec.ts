import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LayoutTray from "./LayoutTray.vue";
import { PIECE_DRAG_TYPE } from "../furniture";
import type { Furniture } from "../types";

const sofa: Furniture = {
  id: "f_sofa",
  name: "Sofa",
  colour: "grey",
  note: "",
  shape: "rectangle",
  width_cm: 220,
  depth_cm: 95,
  cells: null,
};
const bed: Furniture = {
  ...sofa,
  id: "f_bed",
  name: "Bed",
  width_cm: 160,
  depth_cm: 200,
};

function tray(over: Partial<InstanceType<typeof LayoutTray>["$props"]> = {}) {
  return mount(LayoutTray, {
    props: {
      pieces: [sofa],
      placed: [bed],
      layoutName: "Layout A",
      selectedId: null,
      ...over,
    },
  });
}

describe("LayoutTray", () => {
  it("lists the tray and what's on the plan", async () => {
    const wrapper = tray({ selectedId: "f_bed" });
    expect(wrapper.text()).toContain("Tray · not in Layout A");
    expect(wrapper.get("[data-testid=tray-f_sofa]").text()).toContain(
      "220 × 95 cm",
    );
    expect(wrapper.text()).toContain("On the plan · 1");
    expect(
      wrapper.get("[data-testid=on-plan-f_bed]").attributes("aria-pressed"),
    ).toBe("true");
    await wrapper.get("[data-testid=on-plan-f_bed]").trigger("click");
    expect(wrapper.emitted("select")?.[0]).toEqual(["f_bed"]);
  });

  it("carries the piece id when a card is dragged", async () => {
    const wrapper = tray();
    const data: Record<string, string> = {};
    const dataTransfer = {
      setData: (t: string, v: string) => (data[t] = v),
      effectAllowed: "",
    };
    await wrapper
      .get("[data-testid=tray-f_sofa]")
      .trigger("dragstart", { dataTransfer });
    expect(data[PIECE_DRAG_TYPE]).toBe("f_sofa");
    expect(dataTransfer.effectAllowed).toBe("copy");
  });

  it("says when everything is placed, or nothing exists", () => {
    expect(tray({ pieces: [] }).text()).toContain("Everything is on the plan.");
    expect(tray({ pieces: [], placed: [] }).text()).toContain(
      "Add furniture first",
    );
  });
});
