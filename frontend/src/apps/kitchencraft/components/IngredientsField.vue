<template>
  <div>
    <ul
      v-if="modelValue.length > 0"
      class="kc-chips"
      data-testid="ingredient-chips"
    >
      <li
        v-for="(ingredient, index) in modelValue"
        :key="`${ingredient.category}-${index}`"
      >
        <!--
          The specific where there is one, the bare category where there is not
          — never both stacked as two ingredients (FR-7). The category stays in
          the accessible name so the pantry filter's basis is never hidden.
        -->
        <span class="kc-chip" :title="ingredient.category">
          {{ label(ingredient) }}
          <button
            type="button"
            class="kc-icon-btn"
            :aria-label="`Remove ingredient ${label(ingredient)}`"
            :data-testid="`remove-ingredient-${index}`"
            @click="remove(index)"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </span>
      </li>
    </ul>

    <div class="kc-group">
      <TypeaheadInput
        v-if="pending === null"
        label="Ingredients"
        input-id="ingredients"
        :suggestions="suggestions"
        allow-coin
        @commit="pick"
      />

      <!--
        A category has been taken; the optional specific comes next. The
        category alone is already a complete ingredient tag, so Add is
        reachable without typing anything here.
      -->
      <div v-else data-testid="pending-ingredient">
        <span class="kc-label">Ingredients</span>
        <p class="kc-body" style="margin: 0 0 8px">
          {{ pending }}
        </p>
        <label class="kc-label" for="ingredient-specific"
          >Specific (optional)</label
        >
        <input
          id="ingredient-specific"
          ref="specificInput"
          v-model="specific"
          type="text"
          class="kc-field"
          autocomplete="off"
          data-testid="specific-input"
          @keydown.enter.prevent="confirm()"
          @keydown.esc="cancel()"
        />
        <div class="kc-actions">
          <button
            type="button"
            class="kc-btn kc-btn--quiet"
            data-testid="add-ingredient"
            @click="confirm()"
          >
            Add
          </button>
          <button
            type="button"
            class="kc-btn kc-btn--quiet"
            data-testid="cancel-ingredient"
            @click="cancel()"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from "vue";
import TypeaheadInput from "@/apps/kitchencraft/components/TypeaheadInput.vue";
import { ingredientLabel } from "@/apps/kitchencraft/format";
import type { IngredientTag } from "@/apps/kitchencraft/types";

/**
 * The two-level ingredient input: a category from the shared vocabulary, then
 * the optional free-text specific.
 *
 * Two steps rather than one, because the levels do different jobs — the
 * category is vocabulary the pantry filter matches on, the specific is this
 * cook's note about this recipe and matches nothing. Taking `chickpeas` and
 * then adding `dried chickpeas` is the flow the experience spine walks through.
 */
const props = defineProps<{
  modelValue: IngredientTag[];
  suggestions: string[];
}>();

const emit = defineEmits<{
  "update:modelValue": [ingredients: IngredientTag[]];
  /**
   * A genuinely new category was coined. The parent offers it for the rest of
   * this edit immediately — coining is one action — and it reaches the server
   * when the recipe is saved.
   */
  coin: [category: string];
}>();

const pending = ref<string | null>(null);
const specific = ref("");
const specificInput = ref<HTMLInputElement | null>(null);

const label = ingredientLabel;

function pick(value: string, isNew: boolean): void {
  if (isNew) emit("coin", value);
  pending.value = value;
  specific.value = "";
  void nextTick(() => specificInput.value?.focus());
}

function confirm(): void {
  if (pending.value === null) return;
  const entry: IngredientTag = {
    category: pending.value,
    specific: specific.value.trim() || null,
  };
  const duplicate = props.modelValue.some(
    (i) =>
      i.category.toLowerCase() === entry.category.toLowerCase() &&
      (i.specific ?? "").toLowerCase() === (entry.specific ?? "").toLowerCase(),
  );
  if (!duplicate) emit("update:modelValue", [...props.modelValue, entry]);
  cancel();
}

function cancel(): void {
  pending.value = null;
  specific.value = "";
}

function remove(index: number): void {
  emit(
    "update:modelValue",
    props.modelValue.filter((_, i) => i !== index),
  );
}
</script>
