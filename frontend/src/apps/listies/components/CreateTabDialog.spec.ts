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
  "q-select": {
    template:
      '<select :data-testid="$attrs[\'data-testid\']" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="o in options || []" :key="o.value" :value="o.value">{{ o.label }}</option></select>',
    props: [
      "modelValue",
      "options",
      "dense",
      "outlined",
      "emitValue",
      "mapOptions",
      "label",
    ],
    emits: ["update:modelValue"],
  },
  "q-option-group": {
    template:
      '<div :data-testid="$attrs[\'data-testid\']"><button v-for="o in options" :key="o.value" :data-testid="\'mode-\' + o.value" @click="$emit(\'update:modelValue\', o.value)">{{ o.label }}</button></div>',
    props: ["modelValue", "options", "inline", "dense"],
    emits: ["update:modelValue"],
  },
};

const EXISTING: Tab[] = [
  { id: "tb-1", name: "Packing", order: 0, columns: [], rows: [] },
];

const WITH_COLUMNS: Tab[] = [
  {
    id: "tb-1",
    name: "Packing",
    order: 0,
    columns: [
      { id: "c-1", name: "Item", type: "text", order: 0 },
      { id: "c-2", name: "Qty", type: "number", order: 1 },
    ],
    rows: [],
  },
  {
    id: "tb-2",
    name: "Flights",
    order: 1,
    columns: [{ id: "c-9", name: "Airline", type: "text", order: 0 }],
    rows: [],
  },
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

describe("CreateTabDialog — copying another tab's columns (Story 3.2)", () => {
  const copyMode = async (w: ReturnType<typeof mountDialog>) => {
    await w.find('[data-testid="mode-copy"]').trigger("click");
  };

  it("offers a choice between defining columns and copying a tab", () => {
    const wrapper = mountDialog(WITH_COLUMNS);
    expect(wrapper.find('[data-testid="column-mode"]').exists()).toBe(true);
  });

  it("does not offer copying when the sheet has no other tab", () => {
    expect(mountDialog([]).find('[data-testid="column-mode"]').exists()).toBe(
      false,
    );
  });

  it("hides the column builder in copy mode", async () => {
    const wrapper = mountDialog(WITH_COLUMNS);

    await copyMode(wrapper);

    expect(wrapper.findComponent({ name: "ColumnBuilder" }).exists()).toBe(
      false,
    );
  });

  it("previews the columns that would be copied", async () => {
    const wrapper = mountDialog(WITH_COLUMNS);
    await copyMode(wrapper);

    const preview = wrapper.find('[data-testid="copy-preview"]').text();

    expect(preview).toContain("Item");
    expect(preview).toContain("Qty");
  });

  it("updates the preview when another source tab is chosen", async () => {
    const wrapper = mountDialog(WITH_COLUMNS);
    await copyMode(wrapper);

    await wrapper.find('[data-testid="copy-source"]').setValue("tb-2");

    expect(wrapper.find('[data-testid="copy-preview"]').text()).toContain(
      "Airline",
    );
    expect(wrapper.find('[data-testid="copy-preview"]').text()).not.toContain(
      "Qty",
    );
  });

  it("submits the source tab instead of a column list", async () => {
    const wrapper = mountDialog(WITH_COLUMNS);
    await copyMode(wrapper);
    await wrapper.find('[data-testid="tab-name"]').setValue("Cafés");

    await submitBtn(wrapper).trigger("click");

    expect(wrapper.emitted("submit")![0]![0]).toEqual({
      name: "Cafés",
      copyColumnsFrom: "tb-1",
    });
  });

  it("still requires a tab name in copy mode", async () => {
    const wrapper = mountDialog(WITH_COLUMNS);
    await copyMode(wrapper);

    expect(submitBtn(wrapper).attributes("disabled")).toBeDefined();
  });

  it("returns to defining columns when the mode is switched back", async () => {
    const wrapper = mountDialog(WITH_COLUMNS);
    await copyMode(wrapper);

    await wrapper.find('[data-testid="mode-define"]').trigger("click");

    expect(wrapper.findComponent({ name: "ColumnBuilder" }).exists()).toBe(
      true,
    );
  });
});
