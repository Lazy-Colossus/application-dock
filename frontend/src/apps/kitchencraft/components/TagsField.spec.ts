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

type Wrapper = ReturnType<typeof mountField>;

async function openPop(wrapper: Wrapper) {
  await wrapper.find('[data-testid="tags-open"]').trigger("click");
  return wrapper.find('[data-testid="tags-input"]');
}

async function commit(wrapper: Wrapper, value: string) {
  const input = await openPop(wrapper);
  await input.setValue(value);
  await input.trigger("keydown", { key: "Enter" });
}

function options(wrapper: Wrapper): string[] {
  return wrapper.findAll('[data-testid="tags-option"]').map((o) => o.text());
}

describe("chips", () => {
  it("shows no chips when there are no tags, only the +", () => {
    const wrapper = mountField();
    expect(wrapper.findAll('[data-testid="tag-chip"]')).toHaveLength(0);
    expect(wrapper.find('[data-testid="tags-open"]').exists()).toBe(true);
  });

  it("renders one chip per tag, with the + after them", () => {
    const wrapper = mountField(["cheap", "batch cooking"]);
    expect(wrapper.findAll('[data-testid="tag-chip"]')).toHaveLength(2);
    const items = wrapper.findAll(".kc-chips > li");
    expect(
      items[items.length - 1].find('[data-testid="tags-open"]').exists(),
    ).toBe(true);
  });

  it("removes a tag", async () => {
    const wrapper = mountField(["cheap", "batch cooking"]);
    await wrapper.find('[data-testid="remove-tag-cheap"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([[["batch cooking"]]]);
  });

  it("is headed Tags", () => {
    expect(mountField().find(".kc-label").text()).toBe("Tags");
  });
});

describe("the pop-over", () => {
  it("has no input line until the + is tapped", () => {
    const wrapper = mountField();
    expect(wrapper.find('[data-testid="tags-input"]').exists()).toBe(false);
    expect(
      wrapper.find('[data-testid="tags-open"]').attributes("aria-expanded"),
    ).toBe("false");
  });

  it("opens with the input focused and the suggestions already showing", async () => {
    const wrapper = mountField();
    const input = await openPop(wrapper);
    expect(document.activeElement).toBe(input.element);
    expect(options(wrapper)).toEqual(["batch cooking", "cheap"]);
    expect(
      wrapper.find('[data-testid="tags-open"]').attributes("aria-expanded"),
    ).toBe("true");
  });

  it("stays open after a pick, so a run of tags is one visit", async () => {
    const wrapper = mountField();
    await commit(wrapper, "weeknight");
    expect(wrapper.find('[data-testid="tags-pop"]').exists()).toBe(true);
    expect(options(wrapper).length).toBeGreaterThan(0);
  });

  it("closes on a second tap of the +", async () => {
    const wrapper = mountField();
    await openPop(wrapper);
    await wrapper.find('[data-testid="tags-open"]').trigger("click");
    expect(wrapper.find('[data-testid="tags-pop"]').exists()).toBe(false);
  });

  it("closes on escape and hands focus back to the +", async () => {
    const wrapper = mountField();
    const input = await openPop(wrapper);
    await input.trigger("keydown", { key: "Escape" });
    expect(wrapper.find('[data-testid="tags-pop"]').exists()).toBe(false);
    expect(document.activeElement).toBe(
      wrapper.find('[data-testid="tags-open"]').element,
    );
  });

  it("closes on a tap outside it, adding nothing", async () => {
    const wrapper = mountField();
    await openPop(wrapper);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="tags-pop"]').exists()).toBe(false);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });
});

describe("adding", () => {
  it("takes an existing tag from the list", async () => {
    const wrapper = mountField();
    const input = await openPop(wrapper);
    await input.setValue("bat");
    await wrapper.find('[data-testid="tags-option"]').trigger("mousedown");
    expect(wrapper.emitted("update:modelValue")).toEqual([[["batch cooking"]]]);
  });

  it("accepts a value that matches nothing as a new tag", async () => {
    const wrapper = mountField();
    await commit(wrapper, "weeknight");
    expect(wrapper.emitted("update:modelValue")).toEqual([[["weeknight"]]]);
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
    await openPop(wrapper);
    expect(options(wrapper)).toEqual(["batch cooking"]);
  });
});
