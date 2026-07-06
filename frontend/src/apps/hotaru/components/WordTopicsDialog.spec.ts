import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import WordTopicsDialog from "./WordTopicsDialog.vue";
import type { Word, Topic } from "@/apps/hotaru/types";

const WORD: Word = {
  id: "w1",
  source: "dani",
  reading: "ねこ",
  kanji: "猫",
  romaji: "neko",
  meaning: "cat",
  pos: "noun",
  lesson: "",
  visibility: "shared",
  drill_caps: ["r2m", "m2r", "k2r"],
};

const TOPICS: Topic[] = [
  { id: "t1", name: "Animals", word_ids: ["w1"] }, // w1 is a member
  { id: "t2", name: "Food", word_ids: [] }, // w1 is not
];

// q-dialog renders its default slot; q-btn is a passthrough button.
const STUBS = {
  "q-dialog": { template: "<div><slot /></div>" },
  "q-btn": {
    template:
      '<button :data-testid="$attrs[\'data-testid\']" :disabled="disable" @click="$emit(\'click\')" />',
    props: ["label", "disable", "flat", "unelevated", "noCaps"],
    emits: ["click"],
  },
};

function mountDialog() {
  return mount(WordTopicsDialog, {
    props: { word: WORD, topics: TOPICS, modelValue: true },
    global: { stubs: STUBS },
  });
}

describe("WordTopicsDialog", () => {
  it("reflects membership in the checkboxes", () => {
    const wrapper = mountDialog();
    const t1 = wrapper.find('[data-testid="topic-checkbox-t1"]')
      .element as HTMLInputElement;
    const t2 = wrapper.find('[data-testid="topic-checkbox-t2"]')
      .element as HTMLInputElement;
    expect(t1.checked).toBe(true); // member
    expect(t2.checked).toBe(false); // not a member
  });

  it("emits assign when checking a non-member topic", async () => {
    const wrapper = mountDialog();
    await wrapper.find('[data-testid="topic-checkbox-t2"]').trigger("change");
    expect(wrapper.emitted("assign")?.[0]).toEqual(["t2", "w1"]);
  });

  it("emits unassign when unchecking a member topic", async () => {
    const wrapper = mountDialog();
    await wrapper.find('[data-testid="topic-checkbox-t1"]').trigger("change");
    expect(wrapper.emitted("unassign")?.[0]).toEqual(["t1", "w1"]);
  });

  it("emits create with a trimmed name and clears the field", async () => {
    const wrapper = mountDialog();
    const input = wrapper.find('[data-testid="new-topic-input"]');
    await input.setValue("  Travel  ");
    await wrapper.find('[data-testid="new-topic-add"]').trigger("click");
    expect(wrapper.emitted("create")?.[0]).toEqual(["Travel"]);
    expect((input.element as HTMLInputElement).value).toBe("");
  });
});
