import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import ColumnHeaderMenu from "./ColumnHeaderMenu.vue";
import type { Column, Row } from "@/apps/listies/types";

const STUBS = {
  "q-menu": { template: "<div><slot /></div>" },
  "q-list": { template: "<div><slot /></div>" },
  "q-item": {
    template:
      "<div :data-testid=\"$attrs['data-testid']\" @click=\"$emit('click')\"><slot /></div>",
    props: ["clickable", "disable"],
    emits: ["click"],
  },
  "q-item-section": { template: "<div><slot /></div>" },
  "q-input": {
    template:
      '<input :data-testid="$attrs[\'data-testid\']" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ["modelValue", "dense", "outlined", "autofocus"],
    emits: ["update:modelValue"],
  },
  "q-btn": {
    template:
      '<button :data-testid="$attrs[\'data-testid\']" :disabled="disable" @click="$emit(\'click\', $event)">{{ label }}</button>',
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
  "q-select": {
    template:
      '<select :data-testid="$attrs[\'data-testid\']" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option></select>',
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
};

const COLUMN: Column = { id: "c-1", name: "Item", type: "text", order: 0 };

const ROWS: Row[] = [
  {
    id: "r-1",
    order: 0,
    cells: { "c-1": "Tent" },
    created_at: "t",
    updated_at: "t",
  },
  {
    id: "r-2",
    order: 1,
    cells: { "c-1": "Stove" },
    created_at: "t",
    updated_at: "t",
  },
];

function mountMenu(
  props: Partial<{
    column: Column;
    rows: Row[];
    canMoveLeft: boolean;
    canMoveRight: boolean;
    canDelete: boolean;
  }> = {},
) {
  return mount(ColumnHeaderMenu, {
    props: {
      column: COLUMN,
      rows: ROWS,
      canMoveLeft: true,
      canMoveRight: true,
      canDelete: true,
      ...props,
    },
    global: { stubs: STUBS },
  });
}

describe("ColumnHeaderMenu — rename", () => {
  it("renames the column", async () => {
    const wrapper = mountMenu();
    await wrapper.find('[data-testid="menu-rename"]').trigger("click");

    await wrapper.find('[data-testid="rename-column-input"]').setValue("Gear");
    await wrapper.find('[data-testid="rename-column-save"]').trigger("click");

    expect(wrapper.emitted("rename")).toEqual([["Gear"]]);
  });

  it("cannot save a blank name", async () => {
    const wrapper = mountMenu();
    await wrapper.find('[data-testid="menu-rename"]').trigger("click");

    await wrapper.find('[data-testid="rename-column-input"]').setValue("  ");

    expect(
      wrapper.find('[data-testid="rename-column-save"]').attributes("disabled"),
    ).toBeDefined();
  });
});

describe("ColumnHeaderMenu — retype", () => {
  it("changes the type when nothing would be lost", async () => {
    const wrapper = mountMenu();
    await wrapper.find('[data-testid="menu-retype"]').trigger("click");

    await wrapper.find('[data-testid="retype-select"]').setValue("text");
    await wrapper.find('[data-testid="retype-apply"]').trigger("click");

    expect(wrapper.emitted("retype")).toEqual([["text"]]);
  });

  it("warns how many cells a lossy retype would empty, before applying it", async () => {
    const wrapper = mountMenu();
    await wrapper.find('[data-testid="menu-retype"]').trigger("click");

    await wrapper.find('[data-testid="retype-select"]').setValue("number");

    expect(wrapper.find('[data-testid="retype-warning"]').text()).toContain(
      "2",
    );
    expect(wrapper.emitted("retype")).toBeUndefined();
  });

  it("applies the lossy retype once it is confirmed", async () => {
    const wrapper = mountMenu();
    await wrapper.find('[data-testid="menu-retype"]').trigger("click");
    await wrapper.find('[data-testid="retype-select"]').setValue("number");

    await wrapper.find('[data-testid="retype-apply"]').trigger("click");

    expect(wrapper.emitted("retype")).toEqual([["number"]]);
  });

  it("says nothing about losses when there are none", async () => {
    const wrapper = mountMenu();
    await wrapper.find('[data-testid="menu-retype"]').trigger("click");

    await wrapper.find('[data-testid="retype-select"]').setValue("text");

    expect(wrapper.find('[data-testid="retype-warning"]').exists()).toBe(false);
  });
});

describe("ColumnHeaderMenu — move", () => {
  it("moves left and right", async () => {
    const wrapper = mountMenu();

    await wrapper.find('[data-testid="menu-move-left"]').trigger("click");
    await wrapper.find('[data-testid="menu-move-right"]').trigger("click");

    expect(wrapper.emitted("move")).toEqual([[-1], [1]]);
  });

  it("cannot move past either edge", async () => {
    const wrapper = mountMenu({ canMoveLeft: false, canMoveRight: false });

    await wrapper.find('[data-testid="menu-move-left"]').trigger("click");
    await wrapper.find('[data-testid="menu-move-right"]').trigger("click");

    expect(wrapper.emitted("move")).toBeUndefined();
  });
});

describe("ColumnHeaderMenu — delete", () => {
  it("asks for confirmation and says what will be lost", async () => {
    const wrapper = mountMenu();

    await wrapper.find('[data-testid="menu-delete"]').trigger("click");

    expect(wrapper.emitted("delete")).toBeUndefined();
    expect(
      wrapper.find('[data-testid="delete-column-confirm"]').text(),
    ).toBeTruthy();
    expect(wrapper.text()).toContain("Item");
  });

  it("deletes once confirmed", async () => {
    const wrapper = mountMenu();
    await wrapper.find('[data-testid="menu-delete"]').trigger("click");

    await wrapper
      .find('[data-testid="delete-column-confirm"]')
      .trigger("click");

    expect(wrapper.emitted("delete")).toHaveLength(1);
  });

  it("does not offer delete for the last remaining column", () => {
    const wrapper = mountMenu({ canDelete: false });
    expect(wrapper.find('[data-testid="menu-delete"]').exists()).toBe(false);
  });
});
