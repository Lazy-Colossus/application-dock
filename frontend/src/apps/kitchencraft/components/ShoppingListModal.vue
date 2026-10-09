<template>
  <!--
    A modal, NOT a route. The whole point of this surface is that the screen
    behind it survives untouched — its scroll position and its filter state —
    and a route would remount it. Escape and the backdrop close it, which is
    exactly what a confirmation must never do (UX-DR14).
  -->
  <div
    class="kc-backdrop kitchencraft-panel"
    data-testid="shopping-backdrop"
    @click.self="emit('close')"
  >
    <div
      ref="panel"
      class="kc-sheet"
      :class="{ 'kc-sheet--empty': store.isEmpty }"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shopping-title"
      data-testid="shopping-modal"
      @keydown.esc="emit('close')"
    >
      <div class="kc-bar">
        <h2 id="shopping-title" class="kc-title">Shopping list</h2>
        <div class="kc-bar__actions">
          <!--
            Absent on an empty list: there is nothing to clear, and an empty
            screen offering a destructive action reads as a mistake.
          -->
          <button
            v-if="store.items.length > 0"
            type="button"
            class="kc-btn kc-btn--danger"
            data-testid="shopping-clear"
            @click="clearing = true"
          >
            Clear
          </button>
          <button
            type="button"
            class="kc-icon-btn"
            aria-label="Close shopping list"
            data-testid="shopping-close"
            @click="emit('close')"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>

      <!--
        One line at the head of the modal, never a toast — the failure belongs
        beside the thing that failed.
      -->
      <p
        v-if="store.error"
        class="kc-error kc-pad"
        data-testid="shopping-error"
      >
        {{ store.error }}
      </p>

      <div class="kc-sheet__body">
        <!--
          The modal opens immediately and never waits on the fetch; a skeleton
          stands in until the rows land.
        -->
        <ul
          v-if="!store.loaded"
          class="kc-rows"
          aria-hidden="true"
          data-testid="shopping-skeleton"
        >
          <li v-for="n in 3" :key="n" class="kc-skeleton-row" />
        </ul>

        <p
          v-else-if="store.isEmpty"
          class="kc-state__lede"
          data-testid="shopping-empty"
        >
          The list is empty.
        </p>

        <ul v-else class="kc-rows" data-testid="shopping-items">
          <li
            v-for="item in store.items"
            :key="item.id"
            class="kc-row kc-shop-row"
            :data-testid="`shopping-item-${item.id}`"
          >
            <!--
              The WHOLE row ticks — sized for a thumb on a phone held in a hand
              that is also holding a basket (NFR-4). Delete is a separate
              trailing target so a mistimed tap cannot remove what the user
              meant to tick.
            -->
            <button
              type="button"
              class="kc-row__main kc-shop-row__tick"
              :aria-pressed="item.ticked"
              :aria-label="`${item.text}, ${item.ticked ? 'ticked' : 'not ticked'}`"
              :data-testid="`tick-${item.id}`"
              @click="store.toggleTicked(item.id)"
            >
              <!--
                Both a filled box and a strike-through: two signals, neither of
                them colour, so the mark survives any contrast setting
                (UX-DR17).
              -->
              <svg
                class="kc-shop-row__box"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                :fill="item.ticked ? 'currentColor' : 'none'"
                stroke="currentColor"
                stroke-width="1.5"
                aria-hidden="true"
              >
                <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
                <path
                  v-if="item.ticked"
                  d="M7.5 12.5l3 3 6-6.5"
                  stroke="var(--kc-cream)"
                  stroke-width="2.5"
                  fill="none"
                />
              </svg>
              <span
                class="kc-body"
                :class="{ 'kc-shop-row__done': item.ticked }"
                >{{ item.text }}</span
              >
            </button>

            <button
              type="button"
              class="kc-icon-btn kc-shop-row__delete"
              :aria-label="`Delete ${item.text}`"
              :data-testid="`delete-${item.id}`"
              @click="store.removeItem(item.id)"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </li>
        </ul>
      </div>

      <!--
        At the foot, within thumb reach on a phone. Always present — on an empty
        list it is the way in, which is why the empty state is a line of type
        above it rather than a bare panel (UX-DR13).
      -->
      <form class="kc-sheet__foot" @submit.prevent="commit()">
        <!--
          No visible label: the field sits alone at the foot of the note with a
          placeholder and an add button, and on a surface this small the label
          was a line of chrome above the only input there is. The accessible
          name stays.
        -->
        <div class="kc-typeahead__control">
          <input
            id="shopping-entry"
            ref="entry"
            v-model="draft"
            type="text"
            class="kc-field"
            autocomplete="off"
            placeholder="add an item…"
            aria-label="Add an item"
            data-testid="shopping-entry"
          />
          <button
            type="submit"
            class="kc-btn kc-typeahead__add"
            :disabled="draft.trim() === ''"
            aria-label="Add to shopping list"
            data-testid="shopping-add"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </form>

      <!--
        The app's second destructive confirmation, and it reads like the first:
        the same component, the same plainness, no theatrics. Stacked one level
        over the list (UX-DR14).
      -->
      <ConfirmModal
        v-if="clearing"
        testid="clear"
        :title="clearTitle"
        detail="This can't be undone."
        confirm-label="Clear"
        @confirm="confirmClear()"
        @cancel="clearing = false"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import ConfirmModal from "@/apps/kitchencraft/components/ConfirmModal.vue";
import { useShoppingListStore } from "@/apps/kitchencraft/stores/useShoppingListStore";

/**
 * The one shopping list, opened over whatever screen the user was on.
 *
 * Ticking, deleting and clearing are Story 3.2; sending a recipe's ingredients
 * is 3.3. This surface does the list's existence, hand-entry and persistence,
 * and nothing else.
 */
const emit = defineEmits<{ close: [] }>();

const store = useShoppingListStore();

const draft = ref("");
const clearing = ref(false);

// The count is the whole reason a cook hesitates over this one, so the
// confirmation names it. Singular is spelled out rather than left as "1 items".
const clearTitle = computed(() => {
  const n = store.items.length;
  return `Clear all ${n} ${n === 1 ? "item" : "items"}?`;
});
const entry = ref<HTMLInputElement | null>(null);
const panel = ref<HTMLElement | null>(null);

onMounted(() => {
  // The fetch is not awaited: the modal is already on screen, showing its
  // skeleton, by the time this resolves.
  void store.fetchList();
  // Focus goes to the panel so escape works immediately, then to the entry row
  // — the way in on an empty list, and harmless on a full one.
  panel.value?.focus();
  void nextTick(() => entry.value?.focus());
});

async function confirmClear(): Promise<void> {
  clearing.value = false;
  await store.clearList();
  entry.value?.focus();
}

async function commit(): Promise<void> {
  const text = draft.value;
  if (!text.trim()) return;
  // Cleared up front so a run of items can be typed without waiting on the
  // round trip; a failed write surfaces at the head of the modal, not by
  // putting the text back.
  draft.value = "";
  await store.addItem(text);
  entry.value?.focus();
}
</script>
