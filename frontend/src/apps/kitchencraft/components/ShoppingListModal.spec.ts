import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: vi.fn(), del: vi.fn() },
}));

import ShoppingListModal from "@/apps/kitchencraft/components/ShoppingListModal.vue";
import type { ShoppingItem } from "@/apps/kitchencraft/types";

let counter = 0;

function item(over: Partial<ShoppingItem> = {}): ShoppingItem {
  counter += 1;
  return {
    id: `s-${String(counter).padStart(8, "0")}`,
    text: `Item ${counter}`,
    ticked: false,
    created_at: "2026-09-14T18:40:00+00:00",
    ...over,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  counter = 0;
  vi.clearAllMocks();
});

async function openModal(items: ShoppingItem[] = []) {
  getMock.mockResolvedValueOnce({ schema_version: 1, items });
  const wrapper = mount(ShoppingListModal, { attachTo: document.body });
  await flushPromises();
  return wrapper;
}

describe("opening", () => {
  it("renders before the fetch resolves, showing a skeleton", async () => {
    // Never settles — anything visible below is visible without the response.
    getMock.mockReturnValueOnce(new Promise(() => {}));
    const wrapper = mount(ShoppingListModal, { attachTo: document.body });

    expect(wrapper.find('[data-testid="shopping-modal"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="shopping-skeleton"]').exists()).toBe(
      true,
    );
    // The empty state must not flash before the list is known.
    expect(wrapper.find('[data-testid="shopping-empty"]').exists()).toBe(false);
  });

  it("fetches the list on mount", async () => {
    await openModal();
    expect(getMock).toHaveBeenCalledWith("/kitchencraft/shopping-list");
  });

  it("is a dialog, announced as one", async () => {
    const wrapper = await openModal();
    const modal = wrapper.find('[data-testid="shopping-modal"]');
    expect(modal.attributes("role")).toBe("dialog");
    expect(modal.attributes("aria-modal")).toBe("true");
  });
});

describe("the empty list", () => {
  it("says so plainly rather than showing a bare panel", async () => {
    const wrapper = await openModal([]);
    expect(wrapper.find('[data-testid="shopping-empty"]').text()).toBe(
      "The list is empty.",
    );
  });

  it("offers the hand-entry row, focused", async () => {
    const wrapper = await openModal([]);
    const entry = wrapper.find('[data-testid="shopping-entry"]');
    expect(entry.exists()).toBe(true);
    expect(document.activeElement).toBe(entry.element);
  });
});

describe("the populated list", () => {
  it("shows the items in the order given", async () => {
    const wrapper = await openModal([
      item({ text: "bread" }),
      item({ text: "milk" }),
    ]);
    const rows = wrapper.findAll('[data-testid="shopping-items"] .kc-body');
    expect(rows.map((r) => r.text())).toEqual(["bread", "milk"]);
  });

  it("offers hand-entry here too", async () => {
    const wrapper = await openModal([item()]);
    expect(wrapper.find('[data-testid="shopping-entry"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="shopping-empty"]').exists()).toBe(false);
  });

  it("carries no tick or delete control yet", async () => {
    // Story 3.2's, and it must not creep in here.
    const wrapper = await openModal([item({ text: "bread" })]);
    const row = wrapper.find('[data-testid="shopping-items"] .kc-row');
    expect(row.find("input[type=checkbox]").exists()).toBe(false);
    expect(row.find("button").exists()).toBe(false);
  });
});

describe("hand-entry", () => {
  it("adds what was typed and clears the field", async () => {
    const wrapper = await openModal([]);
    postMock.mockResolvedValueOnce(item({ text: "oat milk" }));

    await wrapper.find('[data-testid="shopping-entry"]').setValue("oat milk");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith("/kitchencraft/shopping-list/items", {
      text: "oat milk",
    });
    const entry = wrapper.find<HTMLInputElement>(
      '[data-testid="shopping-entry"]',
    );
    expect(entry.element.value).toBe("");
  });

  it("commits from the add button as well as the form", async () => {
    const wrapper = await openModal([]);
    postMock.mockResolvedValueOnce(item({ text: "oat milk" }));

    await wrapper.find('[data-testid="shopping-entry"]').setValue("oat milk");
    await wrapper.find('[data-testid="shopping-add"]').trigger("click");
    await flushPromises();

    expect(postMock).toHaveBeenCalled();
  });

  it("disables the add button with nothing typed", async () => {
    const wrapper = await openModal([]);
    expect(
      wrapper.find('[data-testid="shopping-add"]').attributes("disabled"),
    ).toBeDefined();
  });

  it("keeps focus so a run of items can be typed", async () => {
    const wrapper = await openModal([]);
    postMock.mockResolvedValueOnce(item({ text: "bread" }));

    await wrapper.find('[data-testid="shopping-entry"]').setValue("bread");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(document.activeElement).toBe(
      wrapper.find('[data-testid="shopping-entry"]').element,
    );
  });

  it("shows one line at the head when the write fails, and no toast", async () => {
    const wrapper = await openModal([]);
    postMock.mockRejectedValueOnce(new Error("Couldn't save that"));

    await wrapper.find('[data-testid="shopping-entry"]').setValue("oat milk");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[data-testid="shopping-error"]').text()).toBe(
      "Couldn't save that",
    );
    // The row is gone again, not left behind as though it saved.
    expect(wrapper.find('[data-testid="shopping-items"]').exists()).toBe(false);
  });
});

describe("closing", () => {
  it("closes on the close button", async () => {
    const wrapper = await openModal();
    await wrapper.find('[data-testid="shopping-close"]').trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("closes on escape", async () => {
    const wrapper = await openModal();
    await wrapper.find('[data-testid="shopping-modal"]').trigger("keydown.esc");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("closes on the backdrop", async () => {
    const wrapper = await openModal();
    await wrapper.find('[data-testid="shopping-backdrop"]').trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("does NOT close on a click inside the panel", async () => {
    // `.self` on the backdrop — a click on a row must not dismiss the list.
    const wrapper = await openModal([item()]);
    await wrapper.find('[data-testid="shopping-modal"]').trigger("click");
    expect(wrapper.emitted("close")).toBeUndefined();
  });
});

describe("what it is not", () => {
  it("offers no surface for creating, naming or deleting a list", async () => {
    const wrapper = await openModal([item()]);
    expect(wrapper.text()).not.toMatch(/new list|rename|delete list|lists/i);
  });
});
