<template>
  <div>
    <!--
      One per line, in entry order, reading the way they will read on the recipe.
      A list, not a bag of chips: these are things you read down.
    -->
    <ul
      v-if="modelValue.length > 0"
      class="kc-ingredients kc-ingredients--editing"
      data-testid="ingredient-rows"
    >
      <li
        v-for="(ingredient, index) in modelValue"
        :key="index"
        class="kc-ingredient"
      >
        <span class="kc-ingredient__measure">{{ measure(ingredient) }}</span>
        <span class="kc-ingredient__name">{{ ingredient.text }}</span>
        <button
          type="button"
          class="kc-icon-btn kc-ingredient__remove"
          :aria-label="`Remove ${label(ingredient)}`"
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
      </li>
    </ul>

    <!--
      Amount, unit, ingredient — in the order they are spoken and written.
      Only the ingredient is required: `garlic` is a complete entry, and no
      optional field may stand between a paste and a saved recipe (FR-3).
    -->
    <div class="kc-group">
      <span class="kc-label">Ingredients</span>
      <div class="kc-ingredient-entry">
        <div class="kc-ingredient-entry__amount">
          <label class="kc-label" for="ingredient-amount">Amount</label>
          <input
            id="ingredient-amount"
            v-model="amount"
            type="text"
            class="kc-field"
            autocomplete="off"
            inputmode="decimal"
            data-testid="ingredient-amount"
            @keydown.enter.prevent="commit()"
          />
        </div>

        <!--
          A native datalist rather than the custom typeahead: it is exactly
          "offer a list, accept anything", which is what both of these fields
          are. No coining ceremony — v2 has no shared vocabulary to protect.
        -->
        <div class="kc-ingredient-entry__unit">
          <label class="kc-label" for="ingredient-unit">Unit</label>
          <input
            id="ingredient-unit"
            v-model="unit"
            type="text"
            class="kc-field"
            autocomplete="off"
            list="kc-units"
            data-testid="ingredient-unit"
            @keydown.enter.prevent="commit()"
          />
          <datalist id="kc-units">
            <option v-for="u in units" :key="u" :value="u" />
          </datalist>
        </div>

        <div class="kc-ingredient-entry__text">
          <label class="kc-label" for="ingredient-text">Ingredient</label>
          <input
            id="ingredient-text"
            v-model="text"
            type="text"
            class="kc-field"
            autocomplete="off"
            list="kc-ingredient-suggestions"
            data-testid="ingredient-text"
            @keydown.enter.prevent="commit()"
          />
          <datalist id="kc-ingredient-suggestions">
            <option v-for="i in suggestions" :key="i" :value="i" />
          </datalist>
        </div>
      </div>

      <div class="kc-actions">
        <button
          type="button"
          class="kc-btn kc-btn--quiet"
          :disabled="text.trim() === ''"
          data-testid="add-ingredient"
          @click="commit()"
        >
          Add ingredient
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ingredientLabel } from "@/apps/kitchencraft/format";
import type { Ingredient } from "@/apps/kitchencraft/types";

/**
 * The ingredient input: an amount, a unit and the ingredient itself.
 *
 * Schema v2 replaced the two-level category + specific tag with free text, and
 * the shared vocabulary went with it. What the ingredient field suggests is now
 * this cook's own history, which is what keeps `Feta` and `feta` from becoming
 * two things. Units suggest from the shipped list plus whatever they have
 * coined.
 */
const props = defineProps<{
  modelValue: Ingredient[];
  /** The user's own previously-typed ingredients. */
  suggestions: string[];
  /** The shipped unit list plus this user's own. */
  units: string[];
}>();

const emit = defineEmits<{
  "update:modelValue": [ingredients: Ingredient[]];
}>();

const amount = ref("");
const unit = ref("");
const text = ref("");

const label = ingredientLabel;

/** The amount and unit as one column: `200 g`, `2`, or nothing at all. */
function measure(ingredient: Ingredient): string {
  return [ingredient.amount, ingredient.unit].filter(Boolean).join(" ");
}

function commit(): void {
  const name = text.value.trim();
  if (!name) return;

  const entry: Ingredient = {
    amount: amount.value.trim() || null,
    unit: unit.value.trim() || null,
    text: name,
  };
  const duplicate = props.modelValue.some(
    (i) =>
      i.text.toLowerCase() === entry.text.toLowerCase() &&
      (i.amount ?? "") === (entry.amount ?? "") &&
      (i.unit ?? "") === (entry.unit ?? ""),
  );
  if (!duplicate) emit("update:modelValue", [...props.modelValue, entry]);

  amount.value = "";
  unit.value = "";
  text.value = "";
}

function remove(index: number): void {
  emit(
    "update:modelValue",
    props.modelValue.filter((_, i) => i !== index),
  );
}
</script>
