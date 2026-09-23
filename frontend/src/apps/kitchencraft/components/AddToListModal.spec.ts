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

import AddToListModal from "@/apps/kitchencraft/components/AddToListModal.vue";
import { useShoppingListStore } from "@/apps/kitchencraft/stores/useShoppingListStore";
import type { Ingredient } from "@/apps/kitchencraft/types";

function ing(
  text: string,
  amount: string | null = null,
  unit: string | null = null,
): Ingredient {
  return { amount, unit, text };
}

const TRAYBAKE: Ingredient[] = [
  ing("chicken thighs", "4"),
  ing("new potatoes", "500", "g"),
  ing("garlic"),
  ing("salt"),
  ing("black pepper"),
];

function saved(texts: string[]) {
  return texts.map((text, n) => ({
    id: `s-${n}`,
    text,
    ticked: false,
    created_at: "2026-09-15T00:00:00+00:00",
  }));
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  // An empty list by default, so the add-vs-overwrite prompt stays out of the
  // way of the tests that are not about it.
  getMock.mockResolvedValue({ schema_version: 1, items: [] });
  // The count reported is what the SERVER created, so a mock that returns
  // nothing means nothing was added.
  postMock.mockImplementation((_url: string, body: { texts: string[] }) =>
    Promise.resolve(saved(body.texts)),
  );
});

function mountModal(ingredients: Ingredient[] = TRAYBAKE) {
  return mount(AddToListModal, {
    props: { ingredients },
    attachTo: document.body,
  });
}

function checkedStates(wrapper: ReturnType<typeof mountModal>): boolean[] {
  return wrapper
    .findAll<HTMLInputElement>('input[type="checkbox"]')
    .map((c) => c.element.checked);
}

describe("what it lists", () => {
  it("shows one checkbox per ingredient", () => {
    expect(mountModal().findAll('input[type="checkbox"]')).toHaveLength(5);
  });

  it("reads each one as amount, unit, ingredient", () => {
    const rows = mountModal()
      .findAll('[data-testid="add-items"] .kc-body')
      .map((r) => r.text());
    expect(rows).toEqual([
      "4 chicken thighs",
      "500 g new potatoes",
      "garlic",
      "salt",
      "black pepper",
    ]);
  });
});

describe("the staples", () => {
  it("checks everything except salt and black pepper", () => {
    expect(checkedStates(mountModal())).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it("leaves `red peppers` CHECKED — a substring match would drop it", () => {
    // The trap: `red peppers` contains neither staple, but a loose `includes`
    // against "black pepper" would catch it and the cook would buy none.
    const wrapper = mountModal([ing("red peppers", "3")]);
    expect(checkedStates(wrapper)).toEqual([true]);
  });

  it("leaves `salted butter` CHECKED for the same reason", () => {
    expect(checkedStates(mountModal([ing("salted butter")]))).toEqual([true]);
  });

  it("under-matches rather than over-matches", () => {
    // `freshly ground black pepper` stays checked. Narrow by design: a staple
    // left checked costs one unticked line, a real ingredient dropped costs
    // the meal.
    const wrapper = mountModal([ing("freshly ground black pepper")]);
    expect(checkedStates(wrapper)).toEqual([true]);
  });

  it("matches a staple whatever its casing", () => {
    const wrapper = mountModal([ing("Salt"), ing("Black Pepper")]);
    expect(checkedStates(wrapper)).toEqual([false, false]);
  });

  it("lets the user check a staple back on", async () => {
    const wrapper = mountModal();
    await wrapper.find('[data-testid="add-check-3"]').trigger("change");
    expect(checkedStates(wrapper)[3]).toBe(true);
  });

  it("lets the user uncheck an ordinary ingredient", async () => {
    const wrapper = mountModal();
    await wrapper.find('[data-testid="add-check-0"]').trigger("change");
    expect(checkedStates(wrapper)[0]).toBe(false);
  });
});

describe("confirming", () => {
  it("sends only what is checked, as one request", async () => {
    const wrapper = mountModal();
    await wrapper.find('[data-testid="add-confirm"]').trigger("click");
    await flushPromises();

    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith(
      "/kitchencraft/shopping-list/items/bulk",
      {
        texts: ["4 chicken thighs", "500 g new potatoes", "garlic"],
        mode: "merge",
      },
    );
  });

  it("includes a staple the user checked back on", async () => {
    const wrapper = mountModal();
    await wrapper.find('[data-testid="add-check-3"]').trigger("change");
    await wrapper.find('[data-testid="add-confirm"]').trigger("click");
    await flushPromises();

    expect(postMock.mock.calls[0][1]).toEqual({
      texts: ["4 chicken thighs", "500 g new potatoes", "garlic", "salt"],
      mode: "merge",
    });
  });

  it("is a silent no-op with nothing checked", async () => {
    const wrapper = mountModal([ing("salt"), ing("black pepper")]);
    await wrapper.find('[data-testid="add-confirm"]').trigger("click");
    await flushPromises();

    // Nothing added, no message, no post-add confirmation — it simply closes.
    expect(postMock).not.toHaveBeenCalled();
    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(wrapper.find('[data-testid="add-result"]').exists()).toBe(false);
  });
});

describe("after a successful add", () => {
  async function addThree() {
    const wrapper = mountModal();
    await wrapper.find('[data-testid="add-confirm"]').trigger("click");
    await flushPromises();
    return wrapper;
  }

  it("says how many went on the list", async () => {
    const wrapper = await addThree();
    expect(wrapper.find('[data-testid="add-result"]').text()).toBe(
      "Added 3 items to the shopping list.",
    );
  });

  it("says 'item' rather than '1 items'", async () => {
    const wrapper = mountModal([ing("chicken thighs", "4")]);
    await wrapper.find('[data-testid="add-confirm"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="add-result"]').text()).toBe(
      "Added 1 item to the shopping list.",
    );
  });

  it("never navigates on its own", async () => {
    const wrapper = await addThree();
    // The cook is reading a recipe; the add was an errand, not a destination.
    expect(wrapper.emitted("close")).toBeUndefined();
    expect(useShoppingListStore().isOpen).toBe(false);
  });

  it("offers a way through, taken only if chosen", async () => {
    const wrapper = await addThree();
    await wrapper.find('[data-testid="add-view-list"]').trigger("click");

    expect(useShoppingListStore().isOpen).toBe(true);
    // Replaces this modal rather than stacking on it.
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("lets the user stay where they are", async () => {
    const wrapper = await addThree();
    await wrapper.find('[data-testid="add-done"]').trigger("click");

    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(useShoppingListStore().isOpen).toBe(false);
  });

  it("does not offer the checkbox list again", async () => {
    const wrapper = await addThree();
    expect(wrapper.find('[data-testid="add-items"]').exists()).toBe(false);
  });
});

describe("a recipe with nothing to send", () => {
  it("explains rather than showing an empty checkbox list", () => {
    const wrapper = mountModal([]);
    expect(wrapper.find('[data-testid="add-items"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="add-nothing"]').text()).toContain(
      "This recipe has no ingredients listed.",
    );
  });

  it("offers the way to add some", async () => {
    const wrapper = mountModal([]);
    await wrapper.find('[data-testid="add-edit-recipe"]').trigger("click");
    expect(wrapper.emitted("edit")).toHaveLength(1);
  });

  it("offers no way to confirm an empty add", () => {
    expect(mountModal([]).find('[data-testid="add-confirm"]').exists()).toBe(
      false,
    );
  });
});

describe("dismissing", () => {
  it("closes on cancel", async () => {
    const wrapper = mountModal();
    await wrapper.find('[data-testid="add-cancel"]').trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(postMock).not.toHaveBeenCalled();
  });

  it("closes on escape and on the backdrop — it is a modal, not a confirmation", async () => {
    const onEsc = mountModal();
    await onEsc.find('[data-testid="add-modal"]').trigger("keydown.esc");
    expect(onEsc.emitted("close")).toHaveLength(1);

    const onBackdrop = mountModal();
    await onBackdrop.find('[data-testid="add-backdrop"]').trigger("click");
    expect(onBackdrop.emitted("close")).toHaveLength(1);
  });
});

describe("adding to a list that already has items", () => {
  function withList(texts: string[]) {
    getMock.mockResolvedValue({ schema_version: 1, items: saved(texts) });
  }

  async function reachPrompt() {
    withList(["bread", "milk"]);
    const wrapper = mountModal();
    await flushPromises();
    await wrapper.find('[data-testid="add-confirm"]').trigger("click");
    await flushPromises();
    return wrapper;
  }

  it("never interrupts an empty list", async () => {
    // Default mock is an empty list.
    const wrapper = mountModal();
    await flushPromises();
    await wrapper.find('[data-testid="add-confirm"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="add-prompt"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="add-result"]').exists()).toBe(true);
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it("asks, naming the count, when the list is not empty", async () => {
    const wrapper = await reachPrompt();

    expect(wrapper.find('[data-testid="add-prompt"]').text()).toBe(
      "The list already has 2 items.",
    );
    // Nothing has been sent yet.
    expect(postMock).not.toHaveBeenCalled();
  });

  it("says 'item' rather than '1 items'", async () => {
    withList(["bread"]);
    const wrapper = mountModal();
    await flushPromises();
    await wrapper.find('[data-testid="add-confirm"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="add-prompt"]').text()).toBe(
      "The list already has 1 item.",
    );
  });

  it("merges when add is chosen", async () => {
    const wrapper = await reachPrompt();
    await wrapper.find('[data-testid="add-merge"]').trigger("click");
    await flushPromises();

    expect(postMock.mock.calls[0][1]).toMatchObject({ mode: "merge" });
    expect(wrapper.find('[data-testid="add-result"]').exists()).toBe(true);
  });

  it("asks a SECOND time before replacing", async () => {
    const wrapper = await reachPrompt();
    await wrapper.find('[data-testid="add-replace"]').trigger("click");

    expect(wrapper.find('[data-testid="add-overwrite"]').exists()).toBe(true);
    // Still nothing sent: the first choice is not the confirmation.
    expect(postMock).not.toHaveBeenCalled();
  });

  it("replaces the prompt in place rather than stacking on it", async () => {
    // UX-DR14's single stated exception. One dialog on screen, not two.
    const wrapper = await reachPrompt();
    await wrapper.find('[data-testid="add-replace"]').trigger("click");

    expect(wrapper.find('[data-testid="add-prompt"]').exists()).toBe(false);
    expect(wrapper.findAll('[role="dialog"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="confirm-backdrop"]').exists()).toBe(
      false,
    );
  });

  it("overwrites once the second confirmation is given", async () => {
    const wrapper = await reachPrompt();
    await wrapper.find('[data-testid="add-replace"]').trigger("click");
    await wrapper
      .find('[data-testid="add-overwrite-confirm"]')
      .trigger("click");
    await flushPromises();

    expect(postMock.mock.calls[0][1]).toMatchObject({ mode: "overwrite" });
    expect(wrapper.find('[data-testid="add-result"]').exists()).toBe(true);
  });

  it("warns that ticked items go too", async () => {
    const wrapper = await reachPrompt();
    await wrapper.find('[data-testid="add-replace"]').trigger("click");
    expect(wrapper.text()).toContain("ticked ones included");
    expect(wrapper.text()).toContain("can't be undone");
  });
});

describe("cancelling the add-vs-overwrite question", () => {
  function withList(texts: string[]) {
    getMock.mockResolvedValue({ schema_version: 1, items: saved(texts) });
  }

  async function reachPrompt() {
    withList(["bread"]);
    const wrapper = mountModal();
    await flushPromises();
    // Uncheck one so the selection is visibly the user's own.
    await wrapper.find('[data-testid="add-check-0"]').trigger("change");
    await wrapper.find('[data-testid="add-confirm"]').trigger("click");
    await flushPromises();
    return wrapper;
  }

  it("returns to the checkboxes with the selection intact", async () => {
    const wrapper = await reachPrompt();
    await wrapper.find('[data-testid="add-prompt-cancel"]').trigger("click");

    expect(wrapper.find('[data-testid="add-items"]').exists()).toBe(true);
    // Cancelling a question about HOW to add must not throw away WHAT was
    // chosen: the unchecked first ingredient is still unchecked.
    expect(checkedStates(wrapper)[0]).toBe(false);
    expect(postMock).not.toHaveBeenCalled();
  });

  it("returns to the checkboxes from the overwrite confirmation too", async () => {
    const wrapper = await reachPrompt();
    await wrapper.find('[data-testid="add-replace"]').trigger("click");
    await wrapper.find('[data-testid="add-overwrite-cancel"]').trigger("click");

    expect(wrapper.find('[data-testid="add-items"]').exists()).toBe(true);
    expect(postMock).not.toHaveBeenCalled();
  });

  it("does not close the modal", async () => {
    const wrapper = await reachPrompt();
    await wrapper.find('[data-testid="add-prompt-cancel"]').trigger("click");
    expect(wrapper.emitted("close")).toBeUndefined();
  });
});
