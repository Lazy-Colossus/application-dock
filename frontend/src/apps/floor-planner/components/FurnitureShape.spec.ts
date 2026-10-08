import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import FurnitureShape from "./FurnitureShape.vue";
import type { Furniture } from "../types";

function piece(over: Partial<Furniture> = {}): Furniture {
  return {
    id: "f_1",
    name: "Sofa",
    colour: "grey",
    note: "",
    shape: "rectangle",
    width_cm: 220,
    depth_cm: 95,
    cells: null,
    ...over,
  };
}

describe("FurnitureShape", () => {
  it("draws the piece at scale in its colour", () => {
    const wrapper = mount(FurnitureShape, {
      props: { piece: piece(), scale: 0.5 },
    });
    const svg = wrapper.get("svg");
    expect(svg.attributes("width")).toBe("112");
    expect(svg.attributes("aria-label")).toBe("Sofa, 220 × 95 cm");
    expect(wrapper.get("path").attributes("fill")).toBe("#868c94");
    expect(wrapper.get("path").attributes("d")).toMatch(/^M 0 0 H 110/);
  });

  it.each([
    ["round", /^M 0 \S+ A /],
    ["oval", /^M 0 \S+ A /],
    ["egg", /^M \S+ 0 C /],
  ] as const)("draws a %s outline", (shape, start) => {
    const wrapper = mount(FurnitureShape, {
      props: { piece: piece({ shape, width_cm: 80, depth_cm: 80 }), scale: 1 },
    });
    expect(wrapper.get("path").attributes("d")).toMatch(start);
  });

  it("shrinks to fit maxPx", () => {
    const wrapper = mount(FurnitureShape, {
      props: { piece: piece(), scale: 0.8, maxPx: 44 },
    });
    expect(Number(wrapper.get("svg").attributes("width"))).toBeLessThanOrEqual(
      46,
    );
  });

  it("outlines a custom shape once, around its outside", () => {
    const wrapper = mount(FurnitureShape, {
      props: {
        piece: piece({
          shape: "custom",
          cells: ["#.", "##"],
          width_cm: 40,
          depth_cm: 40,
        }),
        scale: 1,
      },
    });
    const paths = wrapper.findAll("path");
    expect(paths).toHaveLength(2);
    expect(paths[0].attributes("stroke")).toBeUndefined();
    expect(
      wrapper.get("[data-testid=custom-edges]").attributes("d")?.match(/M /g),
    ).toHaveLength(8);
  });
});
