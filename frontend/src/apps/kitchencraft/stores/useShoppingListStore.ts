import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { ShoppingItem, ShoppingList } from "@/apps/kitchencraft/types";

// The one shopping list, in its own store because it is its own document on the
// server — read and written independently of the collection, under its own lock.
//
// There is deliberately no create, name, switch or delete here: one list per
// user is the whole model, and the absence of list management is the feature
// (FR-14).
export const useShoppingListStore = defineStore(
  "kitchencraftShoppingList",
  () => {
    const items = ref<ShoppingItem[]>([]);
    const loading = ref(false);
    const error = ref<string | null>(null);
    // Separates "loaded and genuinely empty" from "not fetched yet", so the empty
    // state cannot flash while the modal is still waiting.
    const loaded = ref(false);

    const isEmpty = computed(() => loaded.value && items.value.length === 0);

    function message(e: unknown): string {
      return e instanceof Error ? e.message : String(e);
    }

    /**
     * What a failed WRITE says, verbatim from the spec.
     *
     * Fixed copy rather than the exception's own message: this line is read by
     * someone standing in a shop, and `Failed to fetch` or a bare status code
     * tells them nothing they can act on. A failed *read* keeps the real error,
     * because no spec copy covers it and the modal is empty anyway.
     */
    const WRITE_FAILED = "Couldn't save that — check your connection.";

    async function fetchList(): Promise<void> {
      loading.value = true;
      error.value = null;
      try {
        const list = await api.get<ShoppingList>("/kitchencraft/shopping-list");
        items.value = list.items;
        loaded.value = true;
      } catch (e) {
        error.value = message(e);
      } finally {
        loading.value = false;
      }
    }

    /**
     * Append a hand-entered item.
     *
     * Optimistic and outside `loading`, following `setRating` rather than adding a
     * third pattern: the row appears the moment it is committed so a run of items
     * can be typed without waiting, and the modal never shows a spinner over a
     * list the user is reading in a shop.
     *
     * A failed write removes the provisional row again and puts one line at the
     * head of the modal.
     */
    async function addItem(text: string): Promise<void> {
      const clean = text.trim();
      if (!clean) return;

      // Provisional id, replaced by the server's. Never persisted, and never
      // reused: the row is matched by identity on the way out.
      const provisional: ShoppingItem = {
        id: `pending-${crypto.randomUUID()}`,
        text: clean,
        ticked: false,
        created_at: new Date().toISOString(),
      };
      error.value = null;
      items.value = [...items.value, provisional];

      try {
        const saved = await api.post<ShoppingItem>(
          "/kitchencraft/shopping-list/items",
          { text: clean },
        );
        items.value = items.value.map((i) =>
          i.id === provisional.id ? saved : i,
        );
      } catch {
        error.value = WRITE_FAILED;
        items.value = items.value.filter((i) => i.id !== provisional.id);
      }
    }

    /**
     * Tick or untick one item, in place (Story 3.2).
     *
     * Optimistic and outside `loading` like every other write here. The array is
     * mapped rather than re-sorted: nothing may move the row, which is the whole
     * point of the mark.
     */
    async function toggleTicked(id: string): Promise<void> {
      const target = items.value.find((i) => i.id === id);
      if (!target) return;

      const previous = target.ticked;
      error.value = null;
      items.value = items.value.map((i) =>
        i.id === id ? { ...i, ticked: !previous } : i,
      );
      try {
        const saved = await api.put<ShoppingItem>(
          `/kitchencraft/shopping-list/items/${id}`,
          { ticked: !previous },
        );
        items.value = items.value.map((i) => (i.id === id ? saved : i));
      } catch {
        error.value = WRITE_FAILED;
        items.value = items.value.map((i) =>
          i.id === id ? { ...i, ticked: previous } : i,
        );
      }
    }

    /** Remove one item, ticked or not. */
    async function removeItem(id: string): Promise<void> {
      const index = items.value.findIndex((i) => i.id === id);
      if (index === -1) return;

      const removed = items.value[index];
      error.value = null;
      items.value = items.value.filter((i) => i.id !== id);
      try {
        await api.del(`/kitchencraft/shopping-list/items/${id}`);
      } catch {
        error.value = WRITE_FAILED;
        // Back where it was, not appended to the end — position is meaningful.
        const restored = [...items.value];
        restored.splice(index, 0, removed);
        items.value = restored;
      }
    }

    /** Empty the list. Destructive, and the modal asks first. */
    async function clearList(): Promise<void> {
      const previous = items.value;
      error.value = null;
      items.value = [];
      try {
        await api.del("/kitchencraft/shopping-list/items");
      } catch {
        error.value = WRITE_FAILED;
        // The whole list back, ticks included.
        items.value = previous;
      }
    }

    return {
      items,
      loading,
      error,
      loaded,
      isEmpty,
      fetchList,
      addItem,
      toggleTicked,
      removeItem,
      clearList,
    };
  },
);
