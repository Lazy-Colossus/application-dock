import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import BulkTopicDialog from "./BulkTopicDialog.vue";
import type { Topic } from "@/apps/hotaru/types";

const TOPICS: Topic[] = [
  { id: "t1", name: "Food", word_ids: [] },
  { id: "t2", name: "Verbs", word_ids: [] },
];

const STUBS = {
  "q-dialog": { template: "<div><slot /></div>" },
  "q-icon": { template: "<i />" },
  "q-btn": {
    template:
      "<button :data-testid=\"$attrs['data-testid']\" @click=\"$emit('click')\">{{ label }}</button>",
    props: ["label", "flat", "noCaps", "unelevated", "disable"],
    emits: ["click"],
  },
};

describe("BulkTopicDialog", () => {
  it("picks an existing topic", async () => {
    const wrapper = mount(BulkTopicDialog, {
      props: { topics: TOPICS, count: 3, modelValue: true },
      global: { stubs: STUBS },
    });
    await wrapper.find('[data-testid="bulk-topic-pick-t2"]').trigger("click");
    expect(wrapper.emitted("pick")?.[0]).toEqual(["t2"]);
  });

  it("creates a new topic from the input", async () => {
    const wrapper = mount(BulkTopicDialog, {
      props: { topics: TOPICS, count: 3, modelValue: true },
      global: { stubs: STUBS },
    });
    await wrapper
      .find('[data-testid="bulk-topic-new-input"]')
      .setValue("Colors");
    await wrapper.find('[data-testid="bulk-topic-new-add"]').trigger("click");
    expect(wrapper.emitted("create")?.[0]).toEqual(["Colors"]);
  });
});
