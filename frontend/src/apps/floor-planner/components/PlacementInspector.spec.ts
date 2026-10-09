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
    expect(
      (wrapper.get("[data-testid=rotation-input]").element as HTMLInputElement)
        .value,
    ).toBe("90");
    expect(wrapper.find("[data-testid=inspector-warnings]").exists()).toBe(
      false,
    );
  });

  it("lays the piece horizontal or vertical, keeping the way it faces", async () => {
    const at = (rotation: number) =>
      mount(PlacementInspector, {
        props: { piece: sofa, placement: { ...spot, rotation }, warnings: [] },
      });
    const facingLeft = at(200);
    await facingLeft.get("[data-testid=rotate-horizontal]").trigger("click");
    await facingLeft.get("[data-testid=rotate-vertical]").trigger("click");
    expect(facingLeft.emitted("rotate")).toEqual([[180], [270]]);
    const upright = at(80);
    await upright.get("[data-testid=rotate-horizontal]").trigger("click");
    await upright.get("[data-testid=rotate-vertical]").trigger("click");
    expect(upright.emitted("rotate")).toEqual([[0], [90]]);
  });

  it("steps by 10° and takes a typed angle, wrapping into 0–359", async () => {
    const wrapper = mount(PlacementInspector, {
      props: {
        piece: sofa,
        placement: { ...spot, rotation: 355 },
        warnings: [],
      },
    });
    await wrapper.get("[data-testid=rotate-plus]").trigger("click");
    await wrapper.get("[data-testid=rotate-minus]").trigger("click");
    const input = wrapper.get("[data-testid=rotation-input]");
    await input.setValue("-30");
    await input.setValue("37.6");
    expect(wrapper.emitted("rotate")).toEqual([[5], [345], [330], [38]]);
  });

  it("puts back a value that isn't a number", async () => {
    const wrapper = mount(PlacementInspector, {
      props: { piece: sofa, placement: spot, warnings: [] },
    });
    const input = wrapper.get("[data-testid=rotation-input]");
    await input.setValue("");
    expect(wrapper.emitted("rotate")).toBeUndefined();
    expect((input.element as HTMLInputElement).value).toBe("90");
  });

  it("goes back to the tray and shows warnings", async () => {
    const wrapper = mount(PlacementInspector, {
      props: {
        piece: sofa,
        placement: spot,
        warnings: ["Overlaps a wall", "Outside the apartment"],
      },
    });
    await wrapper.get("[data-testid=back-to-tray]").trigger("click");
    expect(wrapper.emitted("back")).toHaveLength(1);
    expect(wrapper.get("[data-testid=inspector-warnings]").text()).toContain(
      "Overlaps a wall.",
    );
  });
});
