import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import GridControl from "./GridControl.vue";
import { GRID_MAX, GRID_MIN } from "@/apps/context-switch/grid";

function mountControl(columns = 3, rows = 2) {
  return mount(GridControl, { props: { modelValue: { columns, rows } } });
}

async function setField(
  wrapper: ReturnType<typeof mountControl>,
  testid: string,
  value: string,
) {
  const input = wrapper.find(`[data-testid="${testid}"]`);
  (input.element as HTMLInputElement).value = value;
  await input.trigger("change");
}

describe("GridControl", () => {
  it("shows the current grid", () => {
    const wrapper = mountControl(4, 3);
    expect(
      (wrapper.find('[data-testid="grid-columns"]').element as HTMLInputElement)
        .value,
    ).toBe("4");
    expect(
      (wrapper.find('[data-testid="grid-rows"]').element as HTMLInputElement)
        .value,
    ).toBe("3");
  });

  it("emits the whole grid when columns change", async () => {
    const wrapper = mountControl(3, 2);
    await setField(wrapper, "grid-columns", "5");
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([
      { columns: 5, rows: 2 },
    ]);
  });

  it("emits the whole grid when rows change", async () => {
    const wrapper = mountControl(3, 2);
    await setField(wrapper, "grid-rows", "4");
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([
      { columns: 3, rows: 4 },
    ]);
  });

  it("clamps out-of-bounds values instead of emitting them", async () => {
    const tooSmall = mountControl(3, 2);
    await setField(tooSmall, "grid-columns", "0");
    expect(tooSmall.emitted("update:modelValue")?.[0]).toEqual([
      { columns: GRID_MIN, rows: 2 },
    ]);

    const tooBig = mountControl(3, 2);
    await setField(tooBig, "grid-rows", "999");
    expect(tooBig.emitted("update:modelValue")?.[0]).toEqual([
      { columns: 3, rows: GRID_MAX },
    ]);
  });

  it("does not emit when the value is unchanged", async () => {
    const wrapper = mountControl(3, 2);
    await setField(wrapper, "grid-columns", "3");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });
});
