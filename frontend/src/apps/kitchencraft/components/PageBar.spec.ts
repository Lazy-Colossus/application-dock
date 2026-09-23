import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));

import PageBar from "@/apps/kitchencraft/components/PageBar.vue";

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  getMock.mockResolvedValue({ schema_version: 1, items: [] });
});

describe("the bar", () => {
  it("shows the title it is given", () => {
    const wrapper = mount(PageBar, { props: { title: "KitchenCraft" } });
    expect(wrapper.find(".kc-title").text()).toBe("KitchenCraft");
  });

  it("renders without a title, for the reading view", () => {
    // The recipe name below is that screen's heading; a second one would be a
    // duplicate, so the bar carries the chrome alone.
    const wrapper = mount(PageBar);
    expect(wrapper.find(".kc-title").exists()).toBe(false);
    expect(wrapper.find('[data-testid="open-shopping"]').exists()).toBe(true);
  });

  it("puts the page's own action before the shopping list", () => {
    const wrapper = mount(PageBar, {
      props: { title: "KitchenCraft" },
      slots: { default: '<button data-testid="page-action">Add</button>' },
    });
    const order = wrapper
      .findAll(".kc-bar__actions button")
      .map((b) => b.attributes("data-testid"));
    expect(order).toEqual(["page-action", "open-shopping"]);
  });
});

describe("the shopping-list button", () => {
  it("is present with no page action at all", () => {
    expect(mount(PageBar).find('[data-testid="open-shopping"]').exists()).toBe(
      true,
    );
  });

  it("is a quiet icon target, never the moss primary", () => {
    // Moss marks the one thing you came to the screen to do; this is chrome.
    const button = mount(PageBar).find('[data-testid="open-shopping"]');
    expect(button.classes()).toContain("kc-icon-btn");
    expect(button.classes()).not.toContain("kc-btn");
  });

  it("is named for a screen reader", () => {
    expect(
      mount(PageBar)
        .find('[data-testid="open-shopping"]')
        .attributes("aria-label"),
    ).toBe("Shopping list");
  });
});

describe("opening and closing the list", () => {
  it("shows no modal until the button is tapped", () => {
    const wrapper = mount(PageBar);
    expect(wrapper.find('[data-testid="shopping-modal"]').exists()).toBe(false);
  });

  it("opens the modal over the current screen", async () => {
    const wrapper = mount(PageBar, { attachTo: document.body });
    await wrapper.find('[data-testid="open-shopping"]').trigger("click");

    expect(wrapper.find('[data-testid="shopping-modal"]').exists()).toBe(true);
    // The bar — and so the screen it belongs to — is still mounted behind it.
    expect(wrapper.find('[data-testid="open-shopping"]').exists()).toBe(true);
  });

  it("closes again, leaving the bar as it was", async () => {
    const wrapper = mount(PageBar, { attachTo: document.body });
    await wrapper.find('[data-testid="open-shopping"]').trigger("click");
    await wrapper.find('[data-testid="shopping-close"]').trigger("click");

    expect(wrapper.find('[data-testid="shopping-modal"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="open-shopping"]').exists()).toBe(true);
  });

  it("can be reopened", async () => {
    const wrapper = mount(PageBar, { attachTo: document.body });
    await wrapper.find('[data-testid="open-shopping"]').trigger("click");
    await wrapper.find('[data-testid="shopping-close"]').trigger("click");
    await wrapper.find('[data-testid="open-shopping"]').trigger("click");

    expect(wrapper.find('[data-testid="shopping-modal"]').exists()).toBe(true);
  });
});
