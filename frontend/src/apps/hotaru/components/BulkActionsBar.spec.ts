import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import BulkActionsBar from "./BulkActionsBar.vue";

describe("BulkActionsBar", () => {
  it("shows the count and always offers Add to topic + Done", () => {
    const wrapper = mount(BulkActionsBar, {
      props: { count: 3, editable: false, inTopic: false },
    });
    expect(wrapper.find('[data-testid="bulk-bar"]').text()).toContain("3");
    expect(wrapper.find('[data-testid="bulk-add-topic"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="bulk-done"]').exists()).toBe(true);
    // Not editable / not in a topic → no delete / change-lesson / remove.
    expect(wrapper.find('[data-testid="bulk-delete"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="bulk-change-lesson"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="bulk-remove-topic"]').exists()).toBe(
      false,
    );
  });

  it("offers Delete + Change lesson when editable, Remove when in a topic", () => {
    const editable = mount(BulkActionsBar, {
      props: { count: 2, editable: true, inTopic: false },
    });
    expect(editable.find('[data-testid="bulk-delete"]').exists()).toBe(true);
    expect(editable.find('[data-testid="bulk-change-lesson"]').exists()).toBe(
      true,
    );
    const inTopic = mount(BulkActionsBar, {
      props: { count: 2, editable: false, inTopic: true },
    });
    expect(inTopic.find('[data-testid="bulk-remove-topic"]').exists()).toBe(
      true,
    );
  });

  it("disables actions at count 0 and emits on click", async () => {
    const wrapper = mount(BulkActionsBar, {
      props: { count: 0, editable: true, inTopic: false },
    });
    expect(
      wrapper.find('[data-testid="bulk-add-topic"]').attributes("disabled"),
    ).toBeDefined();
    await wrapper.find('[data-testid="bulk-done"]').trigger("click");
    expect(wrapper.emitted("done")).toBeTruthy();
  });

  it("emits the chosen action", async () => {
    const wrapper = mount(BulkActionsBar, {
      props: { count: 2, editable: true, inTopic: true },
    });
    await wrapper.find('[data-testid="bulk-add-topic"]').trigger("click");
    await wrapper.find('[data-testid="bulk-delete"]').trigger("click");
    await wrapper.find('[data-testid="bulk-remove-topic"]').trigger("click");
    expect(wrapper.emitted("add-topic")).toBeTruthy();
    expect(wrapper.emitted("delete")).toBeTruthy();
    expect(wrapper.emitted("remove-topic")).toBeTruthy();
  });
});
