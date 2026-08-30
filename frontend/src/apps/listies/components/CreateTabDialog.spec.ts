import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import CreateTabDialog from "./CreateTabDialog.vue";
import type { ColumnSpec, Tab } from "@/apps/listies/types";

const STUBS = {
  "q-dialog": { template: "<div><slot /></div>" },
  "q-card": { template: "<div><slot /></div>" },
  "q-card-section": { template: "<div><slot /></div>" },
  "q-card-actions": { template: "<div><slot /></div>" },
  "q-input": {
    template:
      '<input :data-testid="$attrs[\'data-testid\']" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ["modelValue", "label", "dense", "outlined", "autofocus"],
    emits: ["update:modelValue"],
  },
  "q-btn": {
    template:
      '<button :data-testid="$attrs[\'data-testid\']" :disabled="disable" @click="$emit(\'click\', $event)">{{ label }}</button>',
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
  "q-select": { template: "<select />" },
};

const EXISTING: Tab[] = [
  { id: "tb-1", name: "Packing", order: 0, columns: [], rows: [] },
];

function mountDialog(existingTabs: Tab[] = EXISTING) {
  return mount(CreateTabDialog, {
    props: { modelValue: true, existingTabs },
    global: { stubs: STUBS },
  });
}

const submitBtn = (w: ReturnType<typeof mountDialog>) =>
  w.find('[data-testid="create-tab-submit"]');

async function setColumns(
  w: ReturnType<typeof mountDialog>,
  columns: ColumnSpec[],
) {
  await w
    .findComponent({ name: "ColumnBuilder" })
    .vm.$emit("update:modelValue", columns);
}

describe("CreateTabDialog", () => {
  it("starts with one empty text column", () => {
    expect(
      mountDialog()
        .findComponent({ name: "ColumnBuilder" })
        .props("modelValue"),
    ).toEqual([{ name: "", type: "text" }]);
  });

  it("disables submit while the tab name is blank", async () => {
    const wrapper = mountDialog();
    await setColumns(wrapper, [{ name: "Airline", type: "text" }]);

    await wrapper.find('[data-testid="tab-name"]').setValue("  ");

    expect(submitBtn(wrapper).attributes("disabled")).toBeDefined();
  });

  it("disables submit while a column name is blank", async () => {
    const wrapper = mountDialog();
    await wrapper.find('[data-testid="tab-name"]').setValue("Flights");

    await setColumns(wrapper, [{ name: " ", type: "text" }]);

    expect(submitBtn(wrapper).attributes("disabled")).toBeDefined();
  });

  it("disables submit on duplicate column names", async () => {
    const wrapper = mountDialog();
    await wrapper.find('[data-testid="tab-name"]').setValue("Flights");

    await setColumns(wrapper, [
      { name: "A", type: "text" },
      { name: "a", type: "number" },
    ]);

    expect(submitBtn(wrapper).attributes("disabled")).toBeDefined();
  });

  it("emits the trimmed name and columns on submit", async () => {
    const wrapper = mountDialog();
    await wrapper.find('[data-testid="tab-name"]').setValue("  Flights  ");
    await setColumns(wrapper, [{ name: " Airline ", type: "text" }]);

    await submitBtn(wrapper).trigger("click");

    expect(wrapper.emitted("submit")![0]![0]).toEqual({
      name: "Flights",
      columns: [{ name: "Airline", type: "text" }],
    });
  });

  it("hints when the name matches an existing tab, without blocking it", async () => {
    const wrapper = mountDialog();
    await setColumns(wrapper, [{ name: "Airline", type: "text" }]);

    await wrapper.find('[data-testid="tab-name"]').setValue("Packing");

    expect(wrapper.find('[data-testid="duplicate-tab-hint"]').exists()).toBe(
      true,
    );
    expect(submitBtn(wrapper).attributes("disabled")).toBeUndefined();
  });

  it("resets when reopened", async () => {
    const wrapper = mountDialog();
    await wrapper.find('[data-testid="tab-name"]').setValue("Flights");

    await wrapper.setProps({ modelValue: false });
    await wrapper.setProps({ modelValue: true });

    expect(
      (wrapper.find('[data-testid="tab-name"]').element as HTMLInputElement)
        .value,
    ).toBe("");
  });
});
