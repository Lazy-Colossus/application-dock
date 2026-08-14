import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import AddTodoDialog from "./AddTodoDialog.vue";
import { DEFAULT_COLOR, PRESET_COLORS } from "@/apps/context-switch/colors";

const STUBS = {
  "q-dialog": { template: "<div><slot /></div>" },
  "q-input": {
    template:
      '<input :data-testid="$attrs[\'data-testid\']" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ["modelValue", "label", "type", "dense", "outlined", "autofocus"],
    emits: ["update:modelValue"],
  },
  "q-btn": {
    template:
      '<button :data-testid="$attrs[\'data-testid\']" :disabled="disable" @click="$emit(\'click\')">{{ label }}</button>',
    props: ["label", "disable", "color", "unelevated", "noCaps", "flat"],
    emits: ["click"],
  },
};

function mountDialog() {
  return mount(AddTodoDialog, {
    props: { modelValue: true },
    global: { stubs: STUBS },
  });
}

describe("AddTodoDialog", () => {
  it("disables submit until a non-blank header is typed", async () => {
    const wrapper = mountDialog();
    const submit = wrapper.find('[data-testid="todo-submit"]');
    expect(submit.attributes("disabled")).toBeDefined();

    await wrapper.find('[data-testid="todo-header-input"]').setValue("   ");
    expect(submit.attributes("disabled")).toBeDefined();

    await wrapper.find('[data-testid="todo-header-input"]').setValue("Ship it");
    expect(submit.attributes("disabled")).toBeUndefined();
  });

  it("emits the trimmed header + color (no update) and closes", async () => {
    const wrapper = mountDialog();
    await wrapper
      .find('[data-testid="todo-header-input"]')
      .setValue("  Ship it  ");
    await wrapper.find('[data-testid="todo-submit"]').trigger("click");

    expect(wrapper.emitted("create")?.[0]).toEqual([
      { header: "Ship it", color: DEFAULT_COLOR },
    ]);
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([false]);
  });

  it("includes a trimmed first update when one is typed", async () => {
    const wrapper = mountDialog();
    await wrapper.find('[data-testid="todo-header-input"]').setValue("Ship it");
    await wrapper
      .find('[data-testid="todo-update-input"]')
      .setValue("  kicked off  ");
    await wrapper.find('[data-testid="todo-submit"]').trigger("click");

    expect(wrapper.emitted("create")?.[0]).toEqual([
      { header: "Ship it", color: DEFAULT_COLOR, update: "kicked off" },
    ]);
  });

  it("has no details field", () => {
    const wrapper = mountDialog();
    expect(wrapper.find('[data-testid="todo-body-input"]').exists()).toBe(false);
  });

  it("emits the color chosen in the picker", async () => {
    const wrapper = mountDialog();
    await wrapper.find('[data-testid="todo-header-input"]').setValue("X");
    await wrapper
      .find(`[data-testid="swatch-${PRESET_COLORS[3].slice(1)}"]`)
      .trigger("click");
    await wrapper.find('[data-testid="todo-submit"]').trigger("click");

    expect(wrapper.emitted("create")?.[0]).toEqual([
      { header: "X", color: PRESET_COLORS[3] },
    ]);
  });

  it("closes without emitting on cancel", async () => {
    const wrapper = mountDialog();
    await wrapper.find('[data-testid="todo-header-input"]').setValue("X");
    await wrapper.find('[data-testid="todo-cancel"]').trigger("click");

    expect(wrapper.emitted("create")).toBeUndefined();
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([false]);
  });

  it("resets the form when reopened", async () => {
    const wrapper = mount(AddTodoDialog, {
      props: { modelValue: false },
      global: { stubs: STUBS },
    });
    await wrapper.setProps({ modelValue: true });
    await wrapper.find('[data-testid="todo-header-input"]').setValue("First");
    await wrapper.setProps({ modelValue: false });
    await wrapper.setProps({ modelValue: true });

    const header = wrapper.find('[data-testid="todo-header-input"]')
      .element as HTMLInputElement;
    expect(header.value).toBe("");
  });
});
