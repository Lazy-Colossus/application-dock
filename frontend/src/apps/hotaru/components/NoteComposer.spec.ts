import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import NoteComposer from "./NoteComposer.vue";
import type { Visibility } from "@/apps/hotaru/types";

const STUBS = {
  "q-icon": { template: "<i />" },
  "q-btn": {
    template:
      '<button :data-testid="$attrs[\'data-testid\']" :disabled="disable" @click="$emit(\'click\')">{{ label }}</button>',
    props: ["label", "unelevated", "noCaps", "disable"],
    emits: ["click"],
  },
};

function mountComposer(text = "", visibility: Visibility = "shared") {
  return mount(NoteComposer, {
    props: { text, visibility },
    global: { stubs: STUBS },
  });
}

describe("NoteComposer", () => {
  it("emits update:text as the user types", async () => {
    const wrapper = mountComposer();
    await wrapper.find('[data-testid="note-text-input"]').setValue("hi");
    expect(wrapper.emitted("update:text")?.at(-1)).toEqual(["hi"]);
  });

  it("emits update:visibility from the toggle", async () => {
    const wrapper = mountComposer();
    await wrapper.find('[data-testid="note-vis-private"]').trigger("click");
    expect(wrapper.emitted("update:visibility")?.[0]).toEqual(["private"]);
  });

  it("emits add with the trimmed text + visibility when valid", async () => {
    const wrapper = mountComposer("  a tip  ", "private");
    await wrapper.find('[data-testid="note-add"]').trigger("click");
    expect(wrapper.emitted("add")?.[0]).toEqual(["a tip", "private"]);
  });

  it("hides the counter until near the limit", async () => {
    const short = mountComposer("hello");
    expect(short.find('[data-testid="note-count"]').exists()).toBe(false);
    const near = mountComposer("x".repeat(270));
    expect(near.find('[data-testid="note-count"]').text()).toBe("270/300");
  });

  it("errors and blocks Add over 300 (trimmed)", async () => {
    const wrapper = mountComposer("x".repeat(301));
    expect(wrapper.find('[data-testid="note-error"]').exists()).toBe(true);
    expect(
      wrapper.find('[data-testid="note-add"]').attributes("disabled"),
    ).toBeDefined();
    await wrapper.find('[data-testid="note-add"]').trigger("click");
    expect(wrapper.emitted("add")).toBeUndefined();
  });

  it("counts trimmed length — trailing whitespace does not trip the limit", () => {
    const wrapper = mountComposer("x".repeat(300) + "   ");
    expect(wrapper.find('[data-testid="note-count"]').text()).toBe("300/300");
    expect(wrapper.find('[data-testid="note-error"]').exists()).toBe(false);
  });
});
