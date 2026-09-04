import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import ColumnBuilder from "./ColumnBuilder.vue";
import type { ColumnSpec } from "@/apps/listies/types";

const STUBS = {
  "q-input": {
    template:
      '<input :data-testid="$attrs[\'data-testid\']" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ["modelValue", "label", "dense", "outlined", "placeholder"],
    emits: ["update:modelValue"],
  },
  "q-select": {
    template:
      '<select :data-testid="$attrs[\'data-testid\']" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option></select>',
    props: [
      "modelValue",
      "options",
      "label",
      "dense",
      "outlined",
      "emitValue",
      "mapOptions",
    ],
    emits: ["update:modelValue"],
  },
  "q-btn": {
    template:
      '<button :data-testid="$attrs[\'data-testid\']" :disabled="disable" @click="$emit(\'click\')">{{ label }}</button>',
    props: [
      "label",
      "disable",
      "icon",
      "flat",
      "dense",
      "round",
      "color",
      "noCaps",
      "unelevated",
    ],
    emits: ["click"],
  },
};

function mountBuilder(modelValue: ColumnSpec[]) {
  return mount(ColumnBuilder, {
    props: { modelValue },
    global: { stubs: STUBS },
  });
}

function lastEmit(wrapper: ReturnType<typeof mountBuilder>): ColumnSpec[] {
  const events = wrapper.emitted("update:modelValue");
  return events![events!.length - 1]![0] as ColumnSpec[];
}

describe("ColumnBuilder", () => {
  it("renders one editable row per column spec", () => {
    const wrapper = mountBuilder([
      { name: "Item", type: "text" },
      { name: "Qty", type: "number" },
    ]);

    expect(wrapper.findAll('[data-testid^="column-name-"]')).toHaveLength(2);
    expect(
      (
        wrapper.find('[data-testid="column-name-0"]')
          .element as HTMLInputElement
      ).value,
    ).toBe("Item");
  });

  it("emits the updated specs when a name is typed", async () => {
    const wrapper = mountBuilder([{ name: "", type: "text" }]);

    await wrapper.find('[data-testid="column-name-0"]').setValue("Café");

    expect(lastEmit(wrapper)).toEqual([{ name: "Café", type: "text" }]);
  });

  it("emits the updated specs when a type is chosen", async () => {
    const wrapper = mountBuilder([{ name: "Qty", type: "text" }]);

    await wrapper.find('[data-testid="column-type-0"]').setValue("number");

    expect(lastEmit(wrapper)).toEqual([{ name: "Qty", type: "number" }]);
  });

  it("appends a blank text column when adding", async () => {
    const wrapper = mountBuilder([{ name: "Item", type: "text" }]);

    await wrapper.find('[data-testid="add-column"]').trigger("click");

    expect(lastEmit(wrapper)).toEqual([
      { name: "Item", type: "text" },
      { name: "", type: "text" },
    ]);
  });

  it("removes the chosen column", async () => {
    const wrapper = mountBuilder([
      { name: "Item", type: "text" },
      { name: "Qty", type: "number" },
    ]);

    await wrapper.find('[data-testid="remove-column-0"]').trigger("click");

    expect(lastEmit(wrapper)).toEqual([{ name: "Qty", type: "number" }]);
  });

  it("does not offer to remove the last remaining column", () => {
    const wrapper = mountBuilder([{ name: "Item", type: "text" }]);

    expect(wrapper.find('[data-testid="remove-column-0"]').exists()).toBe(
      false,
    );
  });

  it("moves a column up, swapping it with its predecessor", async () => {
    const wrapper = mountBuilder([
      { name: "Item", type: "text" },
      { name: "Qty", type: "number" },
    ]);

    await wrapper.find('[data-testid="move-up-1"]').trigger("click");

    expect(lastEmit(wrapper)).toEqual([
      { name: "Qty", type: "number" },
      { name: "Item", type: "text" },
    ]);
  });

  it("moves a column down, swapping it with its successor", async () => {
    const wrapper = mountBuilder([
      { name: "Item", type: "text" },
      { name: "Qty", type: "number" },
    ]);

    await wrapper.find('[data-testid="move-down-0"]').trigger("click");

    expect(lastEmit(wrapper)).toEqual([
      { name: "Qty", type: "number" },
      { name: "Item", type: "text" },
    ]);
  });

  it("cannot move the first column up or the last column down", () => {
    const wrapper = mountBuilder([
      { name: "Item", type: "text" },
      { name: "Qty", type: "number" },
    ]);

    expect(
      wrapper.find('[data-testid="move-up-0"]').attributes("disabled"),
    ).toBeDefined();
    expect(
      wrapper.find('[data-testid="move-down-1"]').attributes("disabled"),
    ).toBeDefined();
  });

  it("offers exactly the supported column types", () => {
    const wrapper = mountBuilder([{ name: "Item", type: "text" }]);

    const options = wrapper
      .find('[data-testid="column-type-0"]')
      .findAll("option")
      .map((o) => o.attributes("value"));
    expect(options).toEqual(["text", "number", "date", "place_group"]);
  });
});

describe("ColumnBuilder — the place type (Story 4.2)", () => {
  const types = (wrapper: ReturnType<typeof mountBuilder>) =>
    wrapper
      .find('[data-testid="column-type-0"]')
      .findAll("option")
      .map((o) => o.attributes("value"));

  it("does not offer place when maps are not configured", () => {
    expect(types(mountBuilder([{ name: "Item", type: "text" }]))).toEqual([
      "text",
      "number",
      "date",
      "place_group",
    ]);
  });

  it("offers place when maps are configured", () => {
    const wrapper = mount(ColumnBuilder, {
      props: { modelValue: [{ name: "Item", type: "text" }], allowPlace: true },
      global: { stubs: STUBS },
    });

    expect(
      wrapper
        .find('[data-testid="column-type-0"]')
        .findAll("option")
        .map((o) => o.attributes("value")),
    ).toEqual(["text", "number", "date", "place_group", "place"]);
  });
});
