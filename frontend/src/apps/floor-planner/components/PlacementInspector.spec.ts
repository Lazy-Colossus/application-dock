import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import PlacementInspector from "./PlacementInspector.vue";
import type { Furniture, Placement } from "../types";

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
const spot: Placement = {
  furniture_id: "f_sofa",
  x_cm: 100,
  y_cm: 200,
  rotation: 90,
};

describe("PlacementInspector", () => {
  it("shows size, the rotated box's position, and rotation", () => {
    const wrapper = mount(PlacementInspector, {
      props: { piece: sofa, placement: spot, warnings: [] },
    });
    expect(wrapper.text()).toContain("Rectangle · grey");
    expect(wrapper.text()).toContain("220 × 95 cm");
    expect(wrapper.get("[data-testid=inspector-position]").text()).toBe(
      "1.63 m, 1.38 m",
    );
    expect(wrapper.get("[data-testid=inspector-rotation]").text()).toBe("90°");
    expect(wrapper.find("[data-testid=inspector-warnings]").exists()).toBe(
      false,
    );
  });

  it("rotates, goes back to the tray, and shows warnings", async () => {
    const wrapper = mount(PlacementInspector, {
      props: {
        piece: sofa,
        placement: spot,
        warnings: ["Overlaps a wall", "Overlaps Bed"],
      },
    });
    await wrapper.get("[data-testid=rotate-left]").trigger("click");
    await wrapper.get("[data-testid=rotate-right]").trigger("click");
    await wrapper.get("[data-testid=back-to-tray]").trigger("click");
    expect(wrapper.emitted("rotate")).toEqual([[-90], [90]]);
    expect(wrapper.emitted("back")).toHaveLength(1);
    expect(wrapper.get("[data-testid=inspector-warnings]").text()).toContain(
      "Overlaps a wall.",
    );
  });
});
