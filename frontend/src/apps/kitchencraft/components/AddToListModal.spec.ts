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
import type { IngredientTag } from "@/apps/kitchencraft/types";

function ing(category: string, specific: string | null = null): IngredientTag {
  return { category, specific };
}

const TRAYBAKE: IngredientTag[] = [
  ing("chicken", "thighs"),
  ing("potato", "new potatoes"),
  ing("garlic"),
  ing("salt"),
  ing("black pepper"),
];

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  postMock.mockResolvedValue([]);
});

function mountModal(ingredients: IngredientTag[] = TRAYBAKE) {
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

  it("shows the specific where there is one, the category where there is not", () => {
    const rows = mountModal()
      .findAll('[data-testid="add-items"] .kc-body')
      .map((r) => r.text());
    expect(rows).toEqual([
      "thighs",
      "new potatoes",
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

  it("leaves `pepper` CHECKED — it is the vegetable, not a staple", () => {
    // Its own category in the shipped vocabulary. A substring match against
    // "black pepper" would quietly uncheck it and the cook would buy none.
    const wrapper = mountModal([ing("pepper", "red peppers")]);
    expect(checkedStates(wrapper)).toEqual([true]);
  });

  it("matches the staple on category, not on the specific", () => {
    // The category is what the vocabulary knows; `flaky sea salt` under `salt`
    // is still the staple.
    const wrapper = mountModal([ing("salt", "flaky sea salt")]);
    expect(checkedStates(wrapper)).toEqual([false]);
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
      { texts: ["thighs", "new potatoes", "garlic"] },
    );
  });

  it("includes a staple the user checked back on", async () => {
    const wrapper = mountModal();
    await wrapper.find('[data-testid="add-check-3"]').trigger("change");
    await wrapper.find('[data-testid="add-confirm"]').trigger("click");
    await flushPromises();

    expect(postMock.mock.calls[0][1]).toEqual({
      texts: ["thighs", "new potatoes", "garlic", "salt"],
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
    const wrapper = mountModal([ing("chicken", "thighs")]);
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
