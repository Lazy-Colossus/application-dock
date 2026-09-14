import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, putMock, delMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: putMock, del: delMock },
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

  it("gives each row a tick target and a delete target", async () => {
    const only = item({ text: "bread" });
    const wrapper = await openModal([only]);
    expect(wrapper.find(`[data-testid="tick-${only.id}"]`).exists()).toBe(true);
    expect(wrapper.find(`[data-testid="delete-${only.id}"]`).exists()).toBe(
      true,
    );
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

describe("ticking things off", () => {
  it("ticks on a tap anywhere on the row", async () => {
    const only = item({ text: "bread" });
    const wrapper = await openModal([only]);
    putMock.mockResolvedValueOnce({ ...only, ticked: true });

    await wrapper.find(`[data-testid="tick-${only.id}"]`).trigger("click");
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith(
      `/kitchencraft/shopping-list/items/${only.id}`,
      { ticked: true },
    );
  });

  it("strikes the text through AND fills the box — two signals", async () => {
    const only = item({ text: "bread", ticked: true });
    const wrapper = await openModal([only]);

    expect(wrapper.find(".kc-shop-row__done").exists()).toBe(true);
    expect(wrapper.find(".kc-shop-row__box").attributes("fill")).toBe(
      "currentColor",
    );
  });

  it("draws neither on an unticked item", async () => {
    const wrapper = await openModal([item({ ticked: false })]);
    expect(wrapper.find(".kc-shop-row__done").exists()).toBe(false);
    expect(wrapper.find(".kc-shop-row__box").attributes("fill")).toBe("none");
  });

  it("carries the mark in ink, never in moss", async () => {
    const wrapper = await openModal([item({ ticked: true })]);
    expect(wrapper.find(".kc-shop-row").html()).not.toMatch(
      /kc-chip--on|--kc-moss/,
    );
  });

  it("leaves the item exactly where it was", async () => {
    const items = [
      item({ text: "bread" }),
      item({ text: "milk" }),
      item({ text: "apples" }),
    ];
    const wrapper = await openModal(items);
    putMock.mockResolvedValueOnce({ ...items[1], ticked: true });

    await wrapper.find(`[data-testid="tick-${items[1].id}"]`).trigger("click");
    await flushPromises();

    // Not sorted to the bottom, not hidden, not moved to a done group.
    const rows = wrapper.findAll('[data-testid="shopping-items"] .kc-body');
    expect(rows.map((r) => r.text())).toEqual(["bread", "milk", "apples"]);
  });

  it("unticks on a second tap", async () => {
    const only = item({ text: "bread", ticked: true });
    const wrapper = await openModal([only]);
    putMock.mockResolvedValueOnce({ ...only, ticked: false });

    await wrapper.find(`[data-testid="tick-${only.id}"]`).trigger("click");
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith(
      `/kitchencraft/shopping-list/items/${only.id}`,
      { ticked: false },
    );
  });

  it("announces the item and its state", async () => {
    const only = item({ text: "bread", ticked: true });
    const wrapper = await openModal([only]);
    const row = wrapper.find(`[data-testid="tick-${only.id}"]`);
    expect(row.attributes("aria-pressed")).toBe("true");
    expect(row.attributes("aria-label")).toBe("bread, ticked");
  });

  it("reverts the row and reports when the write fails", async () => {
    const only = item({ text: "bread", ticked: false });
    const wrapper = await openModal([only]);
    putMock.mockRejectedValueOnce(new Error("Offline"));

    await wrapper.find(`[data-testid="tick-${only.id}"]`).trigger("click");
    await flushPromises();

    expect(wrapper.find(".kc-shop-row__done").exists()).toBe(false);
    expect(wrapper.find('[data-testid="shopping-error"]').text()).toBe(
      "Offline",
    );
  });
});

describe("deleting one item", () => {
  it("removes just that item", async () => {
    const items = [item({ text: "bread" }), item({ text: "milk" })];
    const wrapper = await openModal(items);
    delMock.mockResolvedValueOnce(undefined);

    await wrapper
      .find(`[data-testid="delete-${items[0].id}"]`)
      .trigger("click");
    await flushPromises();

    expect(delMock).toHaveBeenCalledWith(
      `/kitchencraft/shopping-list/items/${items[0].id}`,
    );
    const rows = wrapper.findAll('[data-testid="shopping-items"] .kc-body');
    expect(rows.map((r) => r.text())).toEqual(["milk"]);
  });

  it("never toggles the tick on the way past", async () => {
    const only = item({ text: "bread" });
    const wrapper = await openModal([only]);
    delMock.mockResolvedValueOnce(undefined);

    await wrapper.find(`[data-testid="delete-${only.id}"]`).trigger("click");
    await flushPromises();

    // A mistimed tap must not tick what the user meant to remove.
    expect(putMock).not.toHaveBeenCalled();
  });

  it("deletes a ticked item just the same", async () => {
    const only = item({ text: "bread", ticked: true });
    const wrapper = await openModal([only]);
    delMock.mockResolvedValueOnce(undefined);

    await wrapper.find(`[data-testid="delete-${only.id}"]`).trigger("click");
    await flushPromises();

    expect(delMock).toHaveBeenCalled();
  });

  it("is named for the item it removes", async () => {
    const only = item({ text: "bread" });
    const wrapper = await openModal([only]);
    expect(
      wrapper
        .find(`[data-testid="delete-${only.id}"]`)
        .attributes("aria-label"),
    ).toBe("Delete bread");
  });
});

describe("clearing the list", () => {
  it("offers no clear control on an empty list", async () => {
    const wrapper = await openModal([]);
    expect(wrapper.find('[data-testid="shopping-clear"]').exists()).toBe(false);
  });

  it("offers clear once there is something to clear", async () => {
    const wrapper = await openModal([item()]);
    expect(wrapper.find('[data-testid="shopping-clear"]').exists()).toBe(true);
  });

  it("asks before emptying anything", async () => {
    const wrapper = await openModal([item()]);
    await wrapper.find('[data-testid="shopping-clear"]').trigger("click");

    expect(wrapper.find('[data-testid="clear-confirm"]').exists()).toBe(true);
    expect(delMock).not.toHaveBeenCalled();
  });

  it("empties on confirming", async () => {
    const wrapper = await openModal([item(), item()]);
    delMock.mockResolvedValueOnce(undefined);

    await wrapper.find('[data-testid="shopping-clear"]').trigger("click");
    await wrapper.find('[data-testid="clear-confirm"]').trigger("click");
    await flushPromises();

    expect(delMock).toHaveBeenCalledWith("/kitchencraft/shopping-list/items");
    expect(wrapper.find('[data-testid="shopping-empty"]').exists()).toBe(true);
  });

  it("leaves the list exactly as it was on cancelling", async () => {
    const wrapper = await openModal([item({ text: "bread" })]);

    await wrapper.find('[data-testid="shopping-clear"]').trigger("click");
    await wrapper.find('[data-testid="clear-cancel"]').trigger("click");
    await flushPromises();

    expect(delMock).not.toHaveBeenCalled();
    const rows = wrapper.findAll('[data-testid="shopping-items"] .kc-body');
    expect(rows.map((r) => r.text())).toEqual(["bread"]);
  });

  it("puts the whole list back when the clear fails", async () => {
    const wrapper = await openModal([
      item({ text: "bread", ticked: true }),
      item({ text: "milk" }),
    ]);
    delMock.mockRejectedValueOnce(new Error("Offline"));

    await wrapper.find('[data-testid="shopping-clear"]').trigger("click");
    await wrapper.find('[data-testid="clear-confirm"]').trigger("click");
    await flushPromises();

    const rows = wrapper.findAll('[data-testid="shopping-items"] .kc-body');
    expect(rows.map((r) => r.text())).toEqual(["bread", "milk"]);
    // Ticks come back too.
    expect(wrapper.find(".kc-shop-row__done").exists()).toBe(true);
  });
});
