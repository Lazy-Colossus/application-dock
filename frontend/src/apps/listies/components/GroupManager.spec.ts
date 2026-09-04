import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import GroupManager from "./GroupManager.vue";
import type { PlaceGroup } from "@/apps/listies/types";

const GROUPS: PlaceGroup[] = [
  { id: "g-1", name: "Must see", color: "#e5484d" },
  { id: "g-2", name: "Maybe", color: "#3e63dd" },
];

// A q-input that emits `blur` (the global stub does not) so we can drive the
// on-blur persistence, and a q-color that emits its picked hex.
const QInputStub = {
  name: "QInput",
  props: ["modelValue"],
  emits: ["update:modelValue", "blur"],
  template: `<div><input :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
      @blur="$emit('blur')" /></div>`,
};

const QColorStub = {
  name: "QColor",
  props: ["modelValue"],
  emits: ["update:modelValue"],
  template: "<div />",
};

// The global q-btn stub is `true`, which drops slot content (the swatch and the
// colour popup live inside a button); render the slot here so they exist.
const QBtnStub = {
  name: "QBtn",
  props: ["label", "icon", "dense", "flat", "round", "noCaps"],
  emits: ["click"],
  template:
    "<button :data-testid=\"$attrs['data-testid']\" @click=\"$emit('click', $event)\"><slot />{{ label }}</button>",
};

function mountManager(groups: PlaceGroup[] = GROUPS) {
  return mount(GroupManager, {
    props: { groups },
    global: {
      stubs: {
        "q-input": QInputStub,
        "q-color": QColorStub,
        "q-btn": QBtnStub,
      },
    },
  });
}

function lastSaved(wrapper: ReturnType<typeof mountManager>): PlaceGroup[] {
  const events = wrapper.emitted("save");
  return events!.at(-1)![0] as PlaceGroup[];
}

describe("GroupManager (Story 4.6)", () => {
  it("lists each group with its name", () => {
    const wrapper = mountManager();
    expect(
      wrapper.find('[data-testid="group-name-0"] input').element,
    ).toHaveProperty("value", "Must see");
    expect(
      wrapper.find('[data-testid="group-name-1"] input').element,
    ).toHaveProperty("value", "Maybe");
  });

  it("shows an empty state with no groups", () => {
    const wrapper = mountManager([]);
    expect(wrapper.find('[data-testid="group-manager-empty"]').exists()).toBe(
      true,
    );
  });

  it("adds a group with a fresh id and a colour, and persists it", async () => {
    const wrapper = mountManager();

    await wrapper.find('[data-testid="group-add"]').trigger("click");

    const saved = lastSaved(wrapper);
    expect(saved).toHaveLength(3);
    expect(saved[2]!.id).toMatch(/^g-/);
    expect(saved[2]!.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(saved[2]!.id).not.toBe("g-1");
  });

  it("persists a rename on blur, carrying the new name", async () => {
    const wrapper = mountManager();

    const input = wrapper.find('[data-testid="group-name-0"] input');
    await input.setValue("Top priority");
    await input.trigger("blur");

    expect(lastSaved(wrapper)[0]!.name).toBe("Top priority");
  });

  it("persists a recolour immediately", async () => {
    const wrapper = mountManager();

    await wrapper
      .findAllComponents({ name: "QColor" })[0]!
      .vm.$emit("update:modelValue", "#00ff00");

    expect(lastSaved(wrapper)[0]!.color).toBe("#00ff00");
  });

  it("persists a delete, dropping that group", async () => {
    const wrapper = mountManager();

    await wrapper.find('[data-testid="group-delete-0"]').trigger("click");

    const saved = lastSaved(wrapper);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.id).toBe("g-2");
  });

  it("does not emit save merely from typing — only on blur", async () => {
    const wrapper = mountManager();

    await wrapper.find('[data-testid="group-name-0"] input').setValue("X");

    expect(wrapper.emitted("save")).toBeUndefined();
  });
});
