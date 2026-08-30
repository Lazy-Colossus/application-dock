import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import CreateSheetDialog from "./CreateSheetDialog.vue";
import type { ColumnSpec } from "@/apps/listies/types";

const STUBS = {
  "q-dialog": { template: "<div><slot /></div>" },
  "q-card": { template: "<div><slot /></div>" },
  "q-card-section": { template: "<div><slot /></div>" },
  "q-card-actions": { template: "<div><slot /></div>" },
  "q-input": {
    template:
      '<input :data-testid="$attrs[\'data-testid\']" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: [
      "modelValue",
      "label",
      "dense",
      "outlined",
      "autofocus",
      "placeholder",
    ],
    emits: ["update:modelValue"],
  },
  "q-btn": {
    template:
      '<button :data-testid="$attrs[\'data-testid\']" :disabled="disable" @click="$emit(\'click\')">{{ label }}</button>',
    props: [
      "label",
      "disable",
      "flat",
      "dense",
      "color",
      "noCaps",
      "unelevated",
      "icon",
      "round",
    ],
    emits: ["click"],
  },
  // Rendered by the nested ColumnBuilder, which this suite exercises through
  // its props rather than its markup.
  // A div with declared props: `options` is read-only on a real <select>
  // element, so a native root makes Vue warn on every render.
  "q-select": {
    template: "<div />",
    props: [
      "modelValue",
      "options",
      "label",
      "dense",
      "outlined",
      "emitValue",
      "mapOptions",
    ],
  },
};

function mountDialog() {
  return mount(CreateSheetDialog, {
    props: { modelValue: true },
    global: { stubs: STUBS },
  });
}

async function fillName(wrapper: ReturnType<typeof mountDialog>, name: string) {
  await wrapper.find('[data-testid="sheet-name"]').setValue(name);
}

async function setColumns(
  wrapper: ReturnType<typeof mountDialog>,
  columns: ColumnSpec[],
) {
  await wrapper
    .findComponent({ name: "ColumnBuilder" })
    .vm.$emit("update:modelValue", columns);
}

function submitBtn(wrapper: ReturnType<typeof mountDialog>) {
  return wrapper.find('[data-testid="create-sheet-submit"]');
}

describe("CreateSheetDialog", () => {
  it("starts with one empty text column", () => {
    const builder = mountDialog().findComponent({ name: "ColumnBuilder" });
    expect(builder.props("modelValue")).toEqual([{ name: "", type: "text" }]);
  });

  it("disables submit while the sheet name is blank", async () => {
    const wrapper = mountDialog();
    await setColumns(wrapper, [{ name: "Item", type: "text" }]);

    await fillName(wrapper, "   ");

    expect(submitBtn(wrapper).attributes("disabled")).toBeDefined();
  });

  it("disables submit while a column name is blank", async () => {
    const wrapper = mountDialog();
    await fillName(wrapper, "Trip");

    await setColumns(wrapper, [{ name: "  ", type: "text" }]);

    expect(submitBtn(wrapper).attributes("disabled")).toBeDefined();
  });

  it("disables submit on duplicate column names, ignoring case", async () => {
    const wrapper = mountDialog();
    await fillName(wrapper, "Trip");

    await setColumns(wrapper, [
      { name: "Item", type: "text" },
      { name: "item", type: "number" },
    ]);

    expect(submitBtn(wrapper).attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("Column names must be unique");
  });

  it("enables submit once the name and columns are valid", async () => {
    const wrapper = mountDialog();
    await fillName(wrapper, "Trip");
    await setColumns(wrapper, [{ name: "Item", type: "text" }]);

    expect(submitBtn(wrapper).attributes("disabled")).toBeUndefined();
  });

  it("emits the trimmed name and the column specs on submit", async () => {
    const wrapper = mountDialog();
    await fillName(wrapper, "  Trip  ");
    await setColumns(wrapper, [
      { name: " Item ", type: "text" },
      { name: "Qty", type: "number" },
    ]);

    await submitBtn(wrapper).trigger("click");

    expect(wrapper.emitted("submit")![0]![0]).toEqual({
      name: "Trip",
      columns: [
        { name: "Item", type: "text" },
        { name: "Qty", type: "number" },
      ],
    });
  });

  it("closes without emitting submit when cancelled", async () => {
    const wrapper = mountDialog();

    await wrapper.find('[data-testid="create-sheet-cancel"]').trigger("click");

    expect(wrapper.emitted("submit")).toBeUndefined();
    expect(wrapper.emitted("update:modelValue")!.at(-1)).toEqual([false]);
  });

  it("resets the form when reopened", async () => {
    const wrapper = mountDialog();
    await fillName(wrapper, "Trip");
    await setColumns(wrapper, [{ name: "Item", type: "text" }]);

    await wrapper.setProps({ modelValue: false });
    await wrapper.setProps({ modelValue: true });

    expect(
      (wrapper.find('[data-testid="sheet-name"]').element as HTMLInputElement)
        .value,
    ).toBe("");
    expect(
      wrapper.findComponent({ name: "ColumnBuilder" }).props("modelValue"),
    ).toEqual([{ name: "", type: "text" }]);
  });
});
