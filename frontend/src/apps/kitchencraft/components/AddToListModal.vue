<template>
  <div
    class="kc-backdrop kc-backdrop--centred kitchencraft-panel"
    data-testid="add-backdrop"
    @click.self="emit('close')"
  >
    <div
      class="kc-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-title"
      data-testid="add-modal"
      tabindex="-1"
      @keydown.esc="emit('close')"
    >
      <!--
        A recipe with nothing structured to send gets its own state entirely —
        never an empty checkbox list, which would read as "you have nothing"
        rather than "there is nothing here yet to send".
      -->
      <template v-if="ingredients.length === 0">
        <h2 id="add-title" class="kc-title">Nothing to send yet</h2>
        <p class="kc-state__lede" data-testid="add-nothing">
          This recipe has no ingredients listed. Add some on the edit screen and
          they can go to the list.
        </p>
        <div class="kc-modal__actions">
          <button
            type="button"
            class="kc-btn kc-btn--quiet"
            data-testid="add-edit-recipe"
            @click="emit('edit')"
          >
            Edit recipe
          </button>
          <button
            type="button"
            class="kc-btn kc-btn--quiet"
            data-testid="add-close"
            @click="emit('close')"
          >
            Close
          </button>
        </div>
      </template>

      <!--
        Sent. The count is the whole message, and the way through to the list is
        offered rather than taken: the cook is reading a recipe, and the add was
        an errand, not a destination (FR-18).
      -->
      <template v-else-if="added !== null">
        <h2 id="add-title" class="kc-title" data-testid="add-result">
          Added {{ added }} {{ added === 1 ? "item" : "items" }} to the shopping
          list.
        </h2>
        <div class="kc-modal__actions">
          <button
            type="button"
            class="kc-btn"
            data-testid="add-view-list"
            @click="viewList()"
          >
            View list
          </button>
          <button
            type="button"
            class="kc-btn kc-btn--quiet"
            data-testid="add-done"
            @click="emit('close')"
          >
            Done
          </button>
        </div>
      </template>

      <!--
        The list already has something on it, so the add becomes a decision.
        Never shown on an empty list: there is nothing to lose, and asking would
        be a tap the cook did not need (FR-17).
      -->
      <template v-else-if="step === 'prompt'">
        <h2 id="add-title" class="kc-title" data-testid="add-prompt">
          The list already has {{ store.items.length }}
          {{ store.items.length === 1 ? "item" : "items" }}.
        </h2>
        <div class="kc-modal__actions">
          <button
            type="button"
            class="kc-btn"
            data-testid="add-merge"
            @click="send('merge')"
          >
            Add to the list
          </button>
          <button
            type="button"
            class="kc-btn kc-btn--danger"
            data-testid="add-replace"
            @click="step = 'overwrite'"
          >
            Replace the list
          </button>
          <button
            type="button"
            class="kc-btn kc-btn--quiet"
            data-testid="add-prompt-cancel"
            @click="step = 'choose'"
          >
            Cancel
          </button>
        </div>
      </template>

      <!--
        The second, explicit confirmation before anything is discarded. It
        REPLACES the prompt in place rather than stacking on it — the single
        stated exception to modals stacking one level deep (UX-DR14), which is
        also why this is not a `ConfirmModal`: that renders its own backdrop.
      -->
      <template v-else-if="step === 'overwrite'">
        <h2 id="add-title" class="kc-title" data-testid="add-overwrite">
          Replace the list?
        </h2>
        <p class="kc-state__lede">
          The
          {{ store.items.length }}
          {{ store.items.length === 1 ? "item" : "items" }} already there will
          be discarded, ticked ones included. This can't be undone.
        </p>
        <div class="kc-modal__actions">
          <button
            type="button"
            class="kc-btn kc-btn--danger"
            data-testid="add-overwrite-confirm"
            @click="send('overwrite')"
          >
            Replace
          </button>
          <button
            type="button"
            class="kc-btn kc-btn--quiet"
            data-testid="add-overwrite-cancel"
            @click="step = 'choose'"
          >
            Cancel
          </button>
        </div>
      </template>

      <template v-else>
        <h2 id="add-title" class="kc-title">Add to shopping list</h2>

        <ul class="kc-rows" data-testid="add-items">
          <li
            v-for="(ingredient, index) in ingredients"
            :key="index"
            class="kc-row kc-shop-row"
          >
            <label class="kc-row__main kc-shop-row__tick">
              <input
                type="checkbox"
                class="kc-checkbox"
                :checked="checked[index]"
                :data-testid="`add-check-${index}`"
                @change="toggle(index)"
              />
              <span class="kc-body">{{ label(ingredient) }}</span>
            </label>
          </li>
        </ul>

        <div class="kc-modal__actions">
          <button
            type="button"
            class="kc-btn"
            data-testid="add-confirm"
            @click="confirm()"
          >
            Add to list
          </button>
          <button
            type="button"
            class="kc-btn kc-btn--quiet"
            data-testid="add-cancel"
            @click="emit('close')"
          >
            Cancel
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ingredientLabel } from "@/apps/kitchencraft/format";
import { useShoppingListStore } from "@/apps/kitchencraft/stores/useShoppingListStore";
import type { Ingredient } from "@/apps/kitchencraft/types";

/**
 * Send a recipe's ingredients to the shopping list (Story 3.3).
 *
 * Always a plain append. Everything about a list that already has items — the
 * prompt, the overwrite, the case-insensitive merge — is Story 3.4.
 */
const props = defineProps<{ ingredients: Ingredient[] }>();

const emit = defineEmits<{
  close: [];
  /** The recipe has nothing to send; the user asked to go and add some. */
  edit: [];
}>();

/**
 * The two the cook almost certainly already has.
 *
 * Matched on the ingredient text, exactly and case-insensitively — never by
 * substring, so `red peppers` is not mistaken for `black pepper` and `salted
 * butter` is not mistaken for `salt`. An exact match is narrow by design: it
 * under-matches (`freshly ground black pepper` stays checked) rather than
 * silently dropping something the cook needs.
 */
const STAPLES = ["salt", "black pepper"];

const store = useShoppingListStore();

// The prompt depends on whether the list is empty, so it has to be known before
// the user can confirm. Cheap when the list is already loaded.
if (!store.loaded) void store.fetchList();

const label = ingredientLabel;

const checked = ref(
  props.ingredients.map((i) => !STAPLES.includes(i.text.trim().toLowerCase())),
);

// Null until an add has happened; the count afterwards.
const added = ref<number | null>(null);

// `choose` is the checkbox list; `prompt` is add-vs-overwrite; `overwrite` is
// its second confirmation. Cancel from either question returns to `choose`
// rather than closing: cancelling a question about *how* to add should not
// throw away *what* was chosen.
const step = ref<"choose" | "prompt" | "overwrite">("choose");

function toggle(index: number): void {
  checked.value = checked.value.map((on, i) => (i === index ? !on : on));
}

function chosen(): string[] {
  return props.ingredients
    .filter((_, i) => checked.value[i])
    .map((i) => label(i));
}

async function confirm(): Promise<void> {
  // Nothing checked is a silent no-op: the modal simply closes, with no message
  // and no post-add confirmation (FR-16).
  if (chosen().length === 0) {
    emit("close");
    return;
  }

  // An empty list is never interrupted — the add is silent (FR-17).
  if (store.items.length === 0) {
    await send("merge");
    return;
  }
  step.value = "prompt";
}

async function send(mode: "merge" | "overwrite"): Promise<void> {
  // The count is what the server actually created, not what was sent: a merge
  // that skips duplicates has to report the smaller, true number (FR-18).
  added.value = await store.addItems(chosen(), mode);
}

// Replaces this modal with the list rather than stacking on it, and is only
// ever reached by the user choosing it.
function viewList(): void {
  emit("close");
  store.open();
}
</script>
