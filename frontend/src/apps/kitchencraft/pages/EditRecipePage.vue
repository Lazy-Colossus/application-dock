<template>
  <q-page class="kitchencraft-app">
    <div class="kc-band">
      <PageBar title="Edit" />

      <p v-if="store.error" class="kc-error kc-pad" data-testid="error">
        {{ store.error }}
      </p>

      <!--
        The edit screen is the ONE exception to the absence rule: it shows every
        field, because this is the surface for setting them. Nothing here counts
        how much structure the recipe has or invites the user to add more.
      -->
      <form v-if="loaded" class="kc-form" @submit.prevent="save()">
        <div class="kc-form__group">
          <label class="kc-label" for="edit-name">Name</label>
          <input
            id="edit-name"
            v-model="form.name"
            type="text"
            class="kc-field"
            :class="{ 'kc-field--error': nameError }"
            autocomplete="off"
            data-testid="name"
          />
          <p
            class="kc-error"
            role="alert"
            aria-live="polite"
            data-testid="name-error"
          >
            {{ nameError }}
          </p>
        </div>

        <div class="kc-form__group">
          <label class="kc-label" for="edit-body">Recipe text</label>
          <textarea
            id="edit-body"
            v-model="form.body"
            class="kc-field kc-field--body"
            :class="{ 'kc-field--error': bodyError }"
            data-testid="body"
          ></textarea>
          <p
            class="kc-error"
            role="alert"
            aria-live="polite"
            data-testid="body-error"
          >
            {{ bodyError }}
          </p>
        </div>

        <div class="kc-form__group">
          <span class="kc-label">Rating</span>
          <RatingStars v-model="form.rating" testid="edit-rating" />
        </div>

        <div class="kc-form__group">
          <span class="kc-label">Meal type</span>
          <ul class="kc-chips">
            <li v-for="mealType in MEAL_TYPES" :key="mealType">
              <!-- One selection or none: tapping the selected chip clears it. -->
              <button
                type="button"
                class="kc-chip kc-chip--control"
                :class="{ 'kc-chip--on': form.meal_type === mealType }"
                :aria-pressed="form.meal_type === mealType"
                :data-testid="`meal-${mealType}`"
                @click="
                  form.meal_type = form.meal_type === mealType ? null : mealType
                "
              >
                {{ mealType }}
              </button>
            </li>
          </ul>
        </div>

        <div class="kc-form__group">
          <label class="kc-label" for="edit-time">Total time (minutes)</label>
          <input
            id="edit-time"
            v-model="timeText"
            type="text"
            inputmode="numeric"
            class="kc-field"
            :class="{ 'kc-field--error': timeError }"
            autocomplete="off"
            data-testid="time"
          />
          <p
            class="kc-error"
            role="alert"
            aria-live="polite"
            data-testid="time-error"
          >
            {{ timeError }}
          </p>
        </div>

        <div class="kc-form__group">
          <label class="kc-label" for="edit-servings">Servings</label>
          <input
            id="edit-servings"
            v-model="servingsText"
            type="text"
            inputmode="numeric"
            class="kc-field"
            :class="{ 'kc-field--error': servingsError }"
            autocomplete="off"
            data-testid="servings"
          />
          <p
            class="kc-error"
            role="alert"
            aria-live="polite"
            data-testid="servings-error"
          >
            {{ servingsError }}
          </p>
        </div>

        <div class="kc-form__group">
          <label class="kc-label" for="edit-source">Source</label>
          <input
            id="edit-source"
            v-model="form.source"
            type="text"
            class="kc-field"
            autocomplete="off"
            data-testid="source"
          />
        </div>

        <!--
          Two separate inputs, never merged, each suggesting only from its own
          namespace (FR-8).
        -->
        <div class="kc-form__group">
          <TagsField v-model="form.tags" :suggestions="tagSuggestions" />
        </div>

        <div class="kc-form__group">
          <IngredientsField
            v-model="form.ingredients"
            :suggestions="ingredientSuggestions"
            :units="store.vocabulary.units"
          />
        </div>

        <div class="kc-actions">
          <button
            type="submit"
            class="kc-btn"
            :disabled="!canSave"
            data-testid="save"
          >
            Save
          </button>
          <button
            type="button"
            class="kc-btn kc-btn--quiet"
            data-testid="cancel"
            @click="back()"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageBar from "@/apps/kitchencraft/components/PageBar.vue";
import IngredientsField from "@/apps/kitchencraft/components/IngredientsField.vue";
import RatingStars from "@/apps/kitchencraft/components/RatingStars.vue";
import TagsField from "@/apps/kitchencraft/components/TagsField.vue";
import {
  orderByUsage,
  tagUsage,
  ingredientUsage,
} from "@/apps/kitchencraft/format";
import { useKitchencraftStore } from "@/apps/kitchencraft/stores/useKitchencraftStore";
import {
  MEAL_TYPES,
  type Ingredient,
  type MealType,
} from "@/apps/kitchencraft/types";
import "./../css/kitchencraft.sass";

const store = useKitchencraftStore();
const route = useRoute();
const router = useRouter();

const recipeId = String(route.params.id ?? "");
const loaded = ref(false);

const form = ref({
  name: "",
  body: "",
  rating: null as number | null,
  meal_type: null as MealType | null,
  source: "",
  tags: [] as string[],
  ingredients: [] as Ingredient[],
});

// Time and servings are held as text so the field can reject what was typed
// without silently rewriting it — the user sees what they typed plus why it is
// not a number yet.
const timeText = ref("");
const servingsText = ref("");

const nameError = ref("");
const bodyError = ref("");

/**
 * Validation happens **at the field, not at save** (UX-DR15).
 *
 * These are computed rather than checked in `save`, so the message appears on
 * the keystroke that made the value invalid. Empty is always valid: an absent
 * time is a legitimate recipe, not an incomplete one.
 */
function numberError(text: string, message: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (!/^\d+$/.test(trimmed)) return message;
  return Number(trimmed) < 1 ? message : "";
}

const timeError = computed(() => numberError(timeText.value, "Minutes only."));
const servingsError = computed(() =>
  numberError(servingsText.value, "A whole number of servings."),
);

const canSave = computed(() => !timeError.value && !servingsError.value);

const tagSuggestions = computed(() =>
  orderByUsage(store.vocabulary.tags, tagUsage(store.recipes)),
);
// The user's own history, most-used first — there is no shared vocabulary in
// v2, so this is simply what they have typed before.
const ingredientSuggestions = computed(() =>
  orderByUsage(store.vocabulary.ingredients, ingredientUsage(store.recipes)),
);

onMounted(async () => {
  if (store.vocabulary.tags.length === 0) void store.fetchVocabulary();
  const recipe = await store.fetchRecipe(recipeId);
  if (!recipe) return;

  form.value = {
    name: recipe.name,
    body: recipe.body,
    rating: recipe.rating,
    meal_type: recipe.meal_type,
    source: recipe.source ?? "",
    tags: [...recipe.tags],
    ingredients: recipe.ingredients.map((i) => ({ ...i })),
  };
  timeText.value =
    recipe.total_time_minutes === null ? "" : String(recipe.total_time_minutes);
  servingsText.value = recipe.servings === null ? "" : String(recipe.servings);
  loaded.value = true;
});

function toNumber(text: string): number | null {
  const trimmed = text.trim();
  return trimmed ? Number(trimmed) : null;
}

async function save(): Promise<void> {
  nameError.value = form.value.name.trim() ? "" : "Give it a name.";
  bodyError.value = form.value.body.trim()
    ? ""
    : "Paste or type the recipe text.";
  if (nameError.value || bodyError.value || !canSave.value) return;

  try {
    // Every field is sent, including the nulls: an explicit null is how a field
    // is cleared, and each one clears independently of the others.
    await store.updateRecipe(recipeId, {
      name: form.value.name,
      body: form.value.body,
      rating: form.value.rating,
      meal_type: form.value.meal_type,
      total_time_minutes: toNumber(timeText.value),
      servings: toNumber(servingsText.value),
      source: form.value.source.trim() || null,
      tags: form.value.tags,
      ingredients: form.value.ingredients,
    });
    back();
  } catch {
    // The store surfaced the message and nothing on the form was cleared.
  }
}

function back(): void {
  void router.push(`/kitchencraft/r/${recipeId}`);
}
</script>
