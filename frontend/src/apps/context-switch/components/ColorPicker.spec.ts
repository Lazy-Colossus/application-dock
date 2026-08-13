import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ColorPicker from "./ColorPicker.vue";
import { PRESET_COLORS } from "@/apps/context-switch/colors";

describe("ColorPicker", () => {
  it("renders a swatch per preset", () => {
    const wrapper = mount(ColorPicker, {
      props: { modelValue: PRESET_COLORS[0] },
    });
    expect(wrapper.findAll(".cs-swatch")).toHaveLength(PRESET_COLORS.length);
  });

  it("emits the preset hex when a swatch is clicked", async () => {
    const wrapper = mount(ColorPicker, { props: { modelValue: "#ffffff" } });
    await wrapper
      .find(`[data-testid="swatch-${PRESET_COLORS[1].slice(1)}"]`)
      .trigger("click");
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([
      PRESET_COLORS[1],
    ]);
  });

  it("emits a custom hex from the color input", async () => {
    const wrapper = mount(ColorPicker, { props: { modelValue: "#ffffff" } });
    const input = wrapper.find('[data-testid="custom-color"]');
    (input.element as HTMLInputElement).value = "#123456";
    await input.trigger("input");
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["#123456"]);
  });

  it("marks the selected preset", () => {
    const wrapper = mount(ColorPicker, {
      props: { modelValue: PRESET_COLORS[2] },
    });
    const selected = wrapper.find(
      `[data-testid="swatch-${PRESET_COLORS[2].slice(1)}"]`,
    );
    expect(selected.classes()).toContain("cs-swatch--on");
  });
});
