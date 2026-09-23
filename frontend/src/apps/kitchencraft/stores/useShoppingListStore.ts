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
    // Whether the list modal is on screen. It lives here rather than in
    // `PageBar` because more than one surface opens it now: the bar's button,
    // and "View list" after a recipe's ingredients are sent (Story 3.3).
    const isOpen = ref(false);

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

    /**
     * Append several items in one request (Story 3.3).
     *
     * One call, not one per ingredient: the server writes the whole batch under
     * a single lock, so a recipe's ingredients either all land or none do. A
     * failure takes the whole batch back out.
     */
    async function addItems(
      texts: string[],
      mode: "merge" | "overwrite" = "merge",
    ): Promise<number> {
      const clean = texts.map((t) => t.trim()).filter(Boolean);
      if (clean.length === 0 && mode === "merge") return 0;

      // Kept whole so an overwrite that fails can put the previous list back,
      // ticks included — the one revert that cannot be done by id.
      const previous = items.value;
      // The server decides what a merge actually adds, so the optimistic view
      // skips what is plainly already there rather than guessing differently.
      const existing = new Set(
        (mode === "overwrite" ? [] : previous).map((i) => i.text.toLowerCase()),
      );
      const provisional: ShoppingItem[] = [];
      for (const text of clean) {
        if (existing.has(text.toLowerCase())) continue;
        existing.add(text.toLowerCase());
        provisional.push({
          id: `pending-${crypto.randomUUID()}`,
          text,
          ticked: false,
          created_at: new Date().toISOString(),
        });
      }
      const ids = new Set(provisional.map((i) => i.id));

      error.value = null;
      items.value =
        mode === "overwrite" ? provisional : [...previous, ...provisional];

      try {
        const saved = await api.post<ShoppingItem[]>(
          "/kitchencraft/shopping-list/items/bulk",
          { texts: clean, mode },
        );
        items.value = [...items.value.filter((i) => !ids.has(i.id)), ...saved];
        // What the server actually created, not what was sent.
        return saved.length;
      } catch {
        error.value = WRITE_FAILED;
        items.value = previous;
        return 0;
      }
    }

    function open(): void {
      isOpen.value = true;
    }

    function close(): void {
      isOpen.value = false;
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
      isOpen,
      open,
      close,
      fetchList,
      addItem,
      addItems,
      toggleTicked,
      removeItem,
      clearList,
    };
  },
);
