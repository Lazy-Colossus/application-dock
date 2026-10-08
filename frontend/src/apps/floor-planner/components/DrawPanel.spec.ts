import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import DrawPanel from "./DrawPanel.vue";
import { DEFAULT_BRUSH, type Brush } from "../codes";

function draw(
  over: Partial<{ brush: Brush; locked: boolean; canUndo: boolean }> = {},
) {
  return mount(DrawPanel, {
    props: {
      brush: DEFAULT_BRUSH,
      shape: "rectangle" as const,
      canUndo: true,
      canRedo: false,
      locked: false,
      ...over,
    },
  });
}

describe("DrawPanel", () => {
  it("picks a floor colour from its chip", async () => {
    const wrapper = draw();
    await wrapper.get("[data-testid=chip-w2]").trigger("click");
    expect(wrapper.emitted("update:brush")?.[0][0]).toEqual({
      id: "wood",
      layer: "surface",
      code: "w2",
    });
  });

  it("selects a structure brush and the eraser", async () => {
    const wrapper = draw();
    await wrapper.get("[data-testid=brush-front_door]").trigger("click");
    await wrapper.get("[data-testid=brush-eraser]").trigger("click");
    const picked = wrapper.emitted("update:brush")!.map((e) => e[0] as Brush);
    expect(picked.map((b) => [b.layer, b.code])).toEqual([
      ["feature", "fd"],
      ["both", ".."],
    ]);
  });

  it("marks the active floor and its chosen chip", () => {
    const wrapper = draw({
      brush: { id: "tile", layer: "surface", code: "t2" },
    });
    expect(
      wrapper.get("[data-testid=brush-tile]").attributes("aria-pressed"),
    ).toBe("true");
    expect(wrapper.get("[data-testid=chip-t2]").classes()).toContain(
      "draw-panel__chip--on",
    );
  });

  it("disables everything on a locked plan", () => {
    const wrapper = draw({ locked: true });
    expect(wrapper.find("[data-testid=draw-locked]").exists()).toBe(true);
    for (const b of wrapper.findAll("button")) {
      expect(b.attributes("disabled")).toBeDefined();
    }
  });

  it("follows canUndo / canRedo", () => {
    const wrapper = draw({ canUndo: false });
    expect(
      wrapper.get("[data-testid=undo]").attributes("disabled"),
    ).toBeDefined();
    expect(
      wrapper.get("[data-testid=redo]").attributes("disabled"),
    ).toBeDefined();
  });
});
