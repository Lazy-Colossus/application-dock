import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TagsField from "@/apps/kitchencraft/components/TagsField.vue";

function mountField(
  modelValue: string[] = [],
  suggestions = ["batch cooking", "cheap"],
) {
  return mount(TagsField, {
    props: { modelValue, suggestions },
    attachTo: document.body,
  });
}

async function commit(wrapper: ReturnType<typeof mountField>, value: string) {
  const input = wrapper.find('[data-testid="tags-input"]');
  await input.trigger("focus");
  await input.setValue(value);
  await input.trigger("keydown", { key: "Enter" });
}

describe("chips", () => {
  it("renders nothing at all when there are no tags", () => {
    expect(mountField().find('[data-testid="tag-chips"]').exists()).toBe(false);
  });

  it("renders one chip per tag", () => {
    const wrapper = mountField(["cheap", "batch cooking"]);
    expect(wrapper.findAll('[data-testid="tag-chips"] .kc-chip')).toHaveLength(
      2,
    );
  });

  it("removes a tag", async () => {
    const wrapper = mountField(["cheap", "batch cooking"]);
    await wrapper.find('[data-testid="remove-tag-cheap"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([[["batch cooking"]]]);
  });
});

describe("adding", () => {
  it("takes an existing tag from the typeahead", async () => {
    const wrapper = mountField();
    const input = wrapper.find('[data-testid="tags-input"]');
    await input.trigger("focus");
    await input.setValue("bat");
    await wrapper
      .findAll('[data-testid="tags-option"]')[0]
      .trigger("mousedown");
    expect(wrapper.emitted("update:modelValue")).toEqual([[["batch cooking"]]]);
  });

  it("accepts a value that matches nothing as a new tag", async () => {
    const wrapper = mountField();
    await commit(wrapper, "weeknight");
    expect(wrapper.emitted("update:modelValue")).toEqual([[["weeknight"]]]);
  });

  it("never offers a new-category row — that ceremony is for ingredients only", async () => {
    const wrapper = mountField();
    const input = wrapper.find('[data-testid="tags-input"]');
    await input.trigger("focus");
    await input.setValue("weeknight");
    expect(wrapper.find('[data-testid="tags-coin"]').exists()).toBe(false);
  });

  it("appends to the tags already held", async () => {
    const wrapper = mountField(["cheap"]);
    await commit(wrapper, "weeknight");
    expect(wrapper.emitted("update:modelValue")).toEqual([
      [["cheap", "weeknight"]],
    ]);
  });

  it("does not add the same chip twice in one sitting", async () => {
    const wrapper = mountField(["cheap"]);
    await commit(wrapper, "CHEAP");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("stops offering a tag already on the recipe", async () => {
    const wrapper = mountField(["cheap"]);
    const input = wrapper.find('[data-testid="tags-input"]');
    await input.trigger("focus");
    expect(
      wrapper.findAll('[data-testid="tags-option"]').map((o) => o.text()),
    ).toEqual(["batch cooking"]);
  });

  it("is labelled Tags", () => {
    expect(mountField().find("label").text()).toBe("Tags");
  });
});
