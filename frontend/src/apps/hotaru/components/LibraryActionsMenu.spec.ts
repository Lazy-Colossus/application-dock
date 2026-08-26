import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LibraryActionsMenu from "./LibraryActionsMenu.vue";

const STUBS = { "q-icon": { template: "<i />" } };

function mountMenu(props: Partial<Record<string, unknown>> = {}) {
  return mount(LibraryActionsMenu, {
    props: {
      selectMode: false,
      count: 0,
      editable: false,
      inTopic: false,
      ...props,
    },
    global: { stubs: STUBS },
  });
}

describe("LibraryActionsMenu", () => {
  it("keeps the menu closed until the ⋮ button is clicked", async () => {
    const wrapper = mountMenu();
    expect(wrapper.find('[data-testid="action-select"]').exists()).toBe(false);
    await wrapper.find('[data-testid="library-actions"]').trigger("click");
    expect(wrapper.find('[data-testid="action-select"]').exists()).toBe(true);
  });

  it("emits select to start selection mode", async () => {
    const wrapper = mountMenu();
    await wrapper.find('[data-testid="library-actions"]').trigger("click");
    await wrapper.find('[data-testid="action-select"]').trigger("click");
    expect(wrapper.emitted("select")).toBeTruthy();
    // Choosing closes the menu.
    expect(wrapper.find('[data-testid="action-select"]').exists()).toBe(false);
  });

  it("shows the count + context-aware actions in select mode", async () => {
    const wrapper = mountMenu({
      selectMode: true,
      count: 2,
      editable: true,
      inTopic: true,
    });
    await wrapper.find('[data-testid="library-actions"]').trigger("click");
    expect(wrapper.text()).toContain("2 selected");
    expect(wrapper.find('[data-testid="bulk-add-topic"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="bulk-remove-topic"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-testid="bulk-change-lesson"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-testid="bulk-delete"]').exists()).toBe(true);
  });

  it("hides delete/change-lesson when not editable and remove when not in a topic", async () => {
    const wrapper = mountMenu({ selectMode: true, count: 1 });
    await wrapper.find('[data-testid="library-actions"]').trigger("click");
    expect(wrapper.find('[data-testid="bulk-add-topic"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="bulk-delete"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="bulk-change-lesson"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="bulk-remove-topic"]').exists()).toBe(
      false,
    );
  });

  it("disables actions at count 0 and emits the chosen action", async () => {
    const wrapper = mountMenu({ selectMode: true, count: 0, editable: true });
    await wrapper.find('[data-testid="library-actions"]').trigger("click");
    expect(
      wrapper.find('[data-testid="bulk-delete"]').attributes("disabled"),
    ).toBeDefined();
    // Cancel is always enabled.
    await wrapper.find('[data-testid="bulk-done"]').trigger("click");
    expect(wrapper.emitted("cancel")).toBeTruthy();
  });
});
