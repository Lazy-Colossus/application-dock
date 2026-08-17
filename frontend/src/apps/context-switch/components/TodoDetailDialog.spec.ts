import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TodoDetailDialog from "./TodoDetailDialog.vue";
import { PRESET_COLORS } from "@/apps/context-switch/colors";
import type { Todo } from "@/apps/context-switch/types";

const STUBS = {
  "q-dialog": { template: "<div><slot /></div>" },
  "q-input": {
    template:
      '<input :data-testid="$attrs[\'data-testid\']" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ["modelValue", "label", "type", "dense", "outlined"],
    emits: ["update:modelValue"],
  },
  "q-btn": {
    template:
      '<button :data-testid="$attrs[\'data-testid\']" :disabled="disable" @click="$emit(\'click\')">{{ label }}</button>',
    props: ["label", "disable", "color", "unelevated", "noCaps", "flat"],
    emits: ["click"],
  },
};

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: "t-1",
    header: "Ship it",
    color: "#aecbfa",
    status: "active",
    order: 0,
    created_at: "2026-08-13T10:00:00Z",
    updated_at: "2026-08-13T10:00:00Z",
    archived_at: null,
    updates: [],
    ...overrides,
  };
}

function mountDialog(todo = makeTodo()) {
  return mount(TodoDetailDialog, {
    props: { modelValue: true, todo },
    global: { stubs: STUBS },
  });
}

function inputValue(
  wrapper: ReturnType<typeof mountDialog>,
  testid: string,
): string {
  return (wrapper.find(`[data-testid="${testid}"]`).element as HTMLInputElement)
    .value;
}

describe("TodoDetailDialog", () => {
  it("opens with the todo's current values", () => {
    const wrapper = mountDialog();
    expect(inputValue(wrapper, "detail-header-input")).toBe("Ship it");
    expect(
      wrapper.find(`[data-testid="swatch-${"#aecbfa".slice(1)}"]`).classes(),
    ).toContain("cs-swatch--on");
  });

  it("has no details field", () => {
    const wrapper = mountDialog();
    expect(wrapper.find('[data-testid="detail-body-input"]').exists()).toBe(
      false,
    );
  });

  it("shows an empty updates log", () => {
    const wrapper = mountDialog();
    expect(wrapper.find('[data-testid="detail-updates-empty"]').exists()).toBe(
      true,
    );
  });

  it("lists the updates log entries when there are any", () => {
    const wrapper = mountDialog(
      makeTodo({
        updates: [
          {
            id: "u-1",
            text: "did a thing",
            created_at: "2026-08-13T11:00:00Z",
          },
        ],
      }),
    );
    expect(wrapper.find('[data-testid="detail-update-u-1"]').text()).toContain(
      "did a thing",
    );
    expect(wrapper.find('[data-testid="detail-updates-empty"]').exists()).toBe(
      false,
    );
  });

  it("renders updates in chronological order", () => {
    const wrapper = mountDialog(
      makeTodo({
        updates: [
          { id: "u-1", text: "first", created_at: "2026-08-13T11:00:00Z" },
          { id: "u-2", text: "second", created_at: "2026-08-13T12:00:00Z" },
        ],
      }),
    );
    const texts = wrapper
      .findAll('[data-testid^="detail-update-u-"]')
      .map((n) => n.text());
    expect(texts[0]).toContain("first");
    expect(texts[1]).toContain("second");
  });

  it("offers no edit/delete affordance on existing update entries (append-only)", () => {
    const wrapper = mountDialog(
      makeTodo({
        updates: [
          { id: "u-1", text: "logged", created_at: "2026-08-13T11:00:00Z" },
        ],
      }),
    );
    const entry = wrapper.find('[data-testid="detail-update-u-1"]');
    expect(entry.find('[data-testid="update-edit-u-1"]').exists()).toBe(false);
    expect(entry.find('[data-testid="update-delete-u-1"]').exists()).toBe(
      false,
    );
  });

  it("keeps the add-update button disabled until text is entered", async () => {
    const wrapper = mountDialog();
    expect(
      wrapper.find('[data-testid="detail-update-add"]').attributes("disabled"),
    ).toBeDefined();

    await wrapper
      .find('[data-testid="detail-update-input"]')
      .setValue("new note");
    expect(
      wrapper.find('[data-testid="detail-update-add"]').attributes("disabled"),
    ).toBeUndefined();
  });

  it("keeps the add-update button disabled for whitespace-only text", async () => {
    const wrapper = mountDialog();
    await wrapper.find('[data-testid="detail-update-input"]').setValue("   ");
    expect(
      wrapper.find('[data-testid="detail-update-add"]').attributes("disabled"),
    ).toBeDefined();
  });

  it("emits add-update with trimmed text and clears the input", async () => {
    const wrapper = mountDialog();
    await wrapper
      .find('[data-testid="detail-update-input"]')
      .setValue("  progress  ");
    await wrapper.find('[data-testid="detail-update-add"]').trigger("click");

    expect(wrapper.emitted("add-update")?.[0]).toEqual(["progress"]);
    // The dialog stays open (adding an update is not saving/closing).
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(inputValue(wrapper, "detail-update-input")).toBe("");
  });

  it("keeps save disabled until something actually changes", async () => {
    const wrapper = mountDialog();
    expect(
      wrapper.find('[data-testid="detail-save"]').attributes("disabled"),
    ).toBeDefined();

    await wrapper.find('[data-testid="detail-header-input"]').setValue("New");
    expect(
      wrapper.find('[data-testid="detail-save"]').attributes("disabled"),
    ).toBeUndefined();
  });

  it("disables save when the header is blanked", async () => {
    const wrapper = mountDialog();
    await wrapper.find('[data-testid="detail-header-input"]').setValue("   ");
    expect(
      wrapper.find('[data-testid="detail-save"]').attributes("disabled"),
    ).toBeDefined();
  });

  it("emits only the changed fields and closes", async () => {
    const wrapper = mountDialog();
    await wrapper
      .find('[data-testid="detail-header-input"]')
      .setValue("  New  ");
    await wrapper.find('[data-testid="detail-save"]').trigger("click");

    expect(wrapper.emitted("save")?.[0]).toEqual([{ header: "New" }]);
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([false]);
  });

  it("emits a color change", async () => {
    const wrapper = mountDialog();
    await wrapper
      .find(`[data-testid="swatch-${PRESET_COLORS[0].slice(1)}"]`)
      .trigger("click");
    await wrapper.find('[data-testid="detail-save"]').trigger("click");
    expect(wrapper.emitted("save")?.[0]).toEqual([{ color: PRESET_COLORS[0] }]);
  });

  it("emits close-as-done when the close control is clicked", async () => {
    const wrapper = mountDialog();
    await wrapper.find('[data-testid="detail-close-done"]').trigger("click");
    expect(wrapper.emitted("close-as-done")).toBeTruthy();
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([false]);
  });

  it("discards edits on cancel", async () => {
    const wrapper = mountDialog();
    await wrapper.find('[data-testid="detail-header-input"]').setValue("New");
    await wrapper.find('[data-testid="detail-cancel"]').trigger("click");

    expect(wrapper.emitted("save")).toBeUndefined();
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([false]);
  });

  it("reseeds when opened on a different todo", async () => {
    const wrapper = mountDialog();
    await wrapper.setProps({
      todo: makeTodo({ id: "t-2", header: "Other", color: "#f28b82" }),
    });
    expect(inputValue(wrapper, "detail-header-input")).toBe("Other");
    expect(
      wrapper.find(`[data-testid="swatch-${"#f28b82".slice(1)}"]`).classes(),
    ).toContain("cs-swatch--on");
  });
});
