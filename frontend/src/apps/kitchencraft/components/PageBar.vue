<template>
  <div class="kc-bar">
    <h1 v-if="title" class="kc-title">{{ title }}</h1>
    <!--
      Without a title the bar is still a bar: the reading view's heading is the
      recipe name in the page below, so this holds the chrome alone.
    -->
    <span v-else />

    <div class="kc-bar__actions">
      <!-- The page's own action, where it has one — the moss button. -->
      <slot />

      <!--
        The shopping list is chrome, not the thing you came to this screen to
        do, so it is a quiet icon target and never takes moss (UX-DR17).
      -->
      <button
        type="button"
        class="kc-icon-btn"
        aria-label="Shopping list"
        data-testid="open-shopping"
        @click="store.open()"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <path
            d="M4 7h16l-1.4 11.2a2 2 0 0 1-2 1.8H7.4a2 2 0 0 1-2-1.8L4 7Z"
          />
          <path d="M9 7V5.5a3 3 0 0 1 6 0V7" />
        </svg>
      </button>
    </div>
  </div>

  <ShoppingListModal v-if="store.isOpen" @close="store.close()" />
</template>

<script setup lang="ts">
import ShoppingListModal from "@/apps/kitchencraft/components/ShoppingListModal.vue";
import { useShoppingListStore } from "@/apps/kitchencraft/stores/useShoppingListStore";

/**
 * The bar every KitchenCraft screen wears, and the shopping list it opens.
 *
 * The button has to be on all four screens (FR-14), so it lives here rather
 * than in four copies — and the modal lives here too, because whichever screen
 * opened it is the screen it must return the user to. Putting the open state in
 * each page would be four copies of the same flag.
 *
 * Not in the dock's `MainLayout`: the spec says every *KitchenCraft* screen,
 * which is narrower than every dock screen, and app code stays inside the app.
 *
 * The open flag moved into the store in Story 3.3, because the bar is no longer
 * the only thing that opens the list — "View list" after sending a recipe's
 * ingredients does too.
 */
withDefaults(defineProps<{ title?: string | null }>(), { title: null });

const store = useShoppingListStore();
</script>
