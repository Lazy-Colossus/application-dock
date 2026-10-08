import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import CustomShapeEditor from "./CustomShapeEditor.vue";

/** The middle of a square in the 11 px editor grid. */
const at = (col: number, row: number) => ({
  clientX: col * 11 + 5,
  clientY: row * 11 + 5,
  pointerId: 1,
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
  } as DOMRect);
});

describe("CustomShapeEditor", () => {
  it("paints a stroke and emits the trimmed mask on release", async () => {
    const wrapper = mount(CustomShapeEditor, { props: { modelValue: [] } });
    const grid = wrapper.get(".shape-editor__grid");
    await grid.trigger("pointerdown", at(4, 6));
    await grid.trigger("pointermove", at(5, 6));
    await grid.trigger("pointermove", at(6, 6));
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    await grid.trigger("pointerup", at(6, 6));
    expect(wrapper.emitted("update:modelValue")?.[0][0]).toEqual(["###"]);
    expect(wrapper.get("[data-testid=shape-readout]").text()).toBe(
      "0.60 × 0.20 m · 60 × 20 cm",
    );
  });

  it("clears when the stroke starts on a painted square", async () => {
    const wrapper = mount(CustomShapeEditor, { props: { modelValue: ["##"] } });
    const grid = wrapper.get(".shape-editor__grid");
    // A 1 × 2 mask is centred in the 20 × 20 grid at row 9, columns 9–10.
    await grid.trigger("pointerdown", at(9, 9));
    await grid.trigger("pointerup", at(9, 9));
    expect(wrapper.emitted("update:modelValue")?.[0][0]).toEqual(["#"]);
  });

  it("says when nothing is painted", () => {
    const wrapper = mount(CustomShapeEditor, { props: { modelValue: [] } });
    expect(wrapper.get("[data-testid=shape-readout]").text()).toBe(
      "Nothing painted yet",
    );
  });
});
