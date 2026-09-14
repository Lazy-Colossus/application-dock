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
      } catch (e) {
        error.value = message(e);
        items.value = items.value.filter((i) => i.id !== provisional.id);
      }
    }

    return { items, loading, error, loaded, isEmpty, fetchList, addItem };
  },
);
