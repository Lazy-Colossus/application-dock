<template>
  <q-page class="kitchencraft-app">
    <div class="kc-band">
      <!--
        The name is the screen's heading and its first field at once: it opens
        on "New Recipe", selected, so typing replaces it and a paste-and-save
        that never touches it still has a name. `form` ties it to the form
        below, so Enter in the bar saves like Enter anywhere else.
      -->
      <PageBar>
        <template #title>
          <input
            id="capture-name"
            ref="nameField"
            v-model="name"
            form="capture-form"
            type="text"
            class="kc-title kc-title-field"
            :class="{ 'kc-title-field--error': nameError }"
            autocomplete="off"
            aria-label="Recipe name"
            :aria-invalid="Boolean(nameError)"
            aria-describedby="capture-name-error"
            data-testid="name"
          />
        </template>
      </PageBar>

      <form
        id="capture-form"
        class="kc-form kc-form--full"
        @submit.prevent="save()"
      >
        <p
          id="capture-name-error"
          class="kc-error"
          role="alert"
          aria-live="polite"
          data-testid="name-error"
        >
          {{ nameError }}
        </p>

        <div class="kc-form__group">
          <label class="kc-label" for="capture-body">Recipe text</label>
          <textarea
            id="capture-body"
            v-model="body"
            class="kc-field kc-field--body"
            :class="{ 'kc-field--error': bodyError }"
            :aria-invalid="Boolean(bodyError)"
            aria-describedby="capture-body-error"
            data-testid="body"
          ></textarea>
          <p
            id="capture-body-error"
            class="kc-error"
            role="alert"
            aria-live="polite"
            data-testid="body-error"
          >
            {{ bodyError }}
          </p>
        </div>

        <!--
          Optional, and below the body so they never stand between a paste and
          Save: a recipe with none of them still saves in three interactions.
        -->
        <div class="kc-form__group">
          <IngredientsField
            v-model="ingredients"
            :suggestions="ingredientSuggestions"
          />
        </div>

        <div class="kc-form__group">
          <span class="kc-label">Meal type</span>
          <ul class="kc-chips">
            <li v-for="type in MEAL_TYPES" :key="type">
              <!-- One selection or none: tapping the selected chip clears it. -->
              <button
                type="button"
                class="kc-chip kc-chip--control"
                :class="{ 'kc-chip--on': mealType === type }"
                :aria-pressed="mealType === type"
                :data-testid="`meal-${type}`"
                @click="mealType = mealType === type ? null : type"
              >
                {{ type }}
              </button>
            </li>
          </ul>
        </div>

        <div class="kc-form__group">
          <label class="kc-label" for="capture-servings">Servings</label>
          <StepperField
            id="capture-servings"
            v-model="servingsText"
            testid="servings"
            noun="servings"
            :invalid="Boolean(servingsError)"
            describedby="capture-servings-error"
          />
          <p
            id="capture-servings-error"
            class="kc-error"
            role="alert"
            aria-live="polite"
            data-testid="servings-error"
          >
            {{ servingsError }}
          </p>
        </div>

        <div class="kc-form__group">
          <TagsField v-model="tags" :suggestions="tagSuggestions" />
        </div>

        <!-- One line above the button, and every field keeps everything. -->
        <p v-if="saveFailed" class="kc-error" data-testid="save-failed">
          Couldn't save — nothing has been lost, try again.
        </p>

        <div class="kc-actions">
          <button
            type="submit"
            class="kc-btn"
            :disabled="saving || Boolean(servingsError)"
            data-testid="save"
          >
            Save
          </button>
          <button
            type="button"
            class="kc-btn kc-btn--quiet"
            data-testid="cancel"
            @click="cancel()"
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
import { useRouter } from "vue-router";
import IngredientsField from "@/apps/kitchencraft/components/IngredientsField.vue";
import PageBar from "@/apps/kitchencraft/components/PageBar.vue";
import StepperField from "@/apps/kitchencraft/components/StepperField.vue";
import TagsField from "@/apps/kitchencraft/components/TagsField.vue";
import {
  ingredientUsage,
  numberError,
  orderByUsage,
  tagUsage,
  toNumber,
} from "@/apps/kitchencraft/format";
import { useKitchencraftStore } from "@/apps/kitchencraft/stores/useKitchencraftStore";
import {
  MEAL_TYPES,
  type Ingredient,
  type MealType,
  type RecipeDraft,
} from "@/apps/kitchencraft/types";
import "./../css/kitchencraft.sass";

const store = useKitchencraftStore();
const router = useRouter();

const name = ref("New Recipe");
const body = ref("");
const mealType = ref<MealType | null>(null);
// Held as text so a bad value shows what was typed plus why, not a rewrite.
// Starts at one so the stepper opens on a number rather than a blank.
const servingsText = ref("1");
const tags = ref<string[]>([]);
const ingredients = ref<Ingredient[]>([]);
const nameError = ref("");
const bodyError = ref("");
const saveFailed = ref(false);
const saving = ref(false);
const nameField = ref<HTMLInputElement | null>(null);

const servingsError = computed(() =>
  numberError(servingsText.value, "A whole number of servings."),
);

const tagSuggestions = computed(() =>
  orderByUsage(store.vocabulary.tags, tagUsage(store.recipes)),
);
const ingredientSuggestions = computed(() =>
  orderByUsage(store.vocabulary.ingredients, ingredientUsage(store.recipes)),
);

onMounted(() => {
  nameField.value?.focus();
  nameField.value?.select();
  if (store.vocabulary.tags.length === 0) void store.fetchVocabulary();
});

/**
 * Only two things can reject a save, and the message names which (FR-3).
 *
 * The optional fields are never required. Servings alone is checked, at the
 * field as it is typed and only once something is in it, so an empty one can
 * never stand between a paste and a saved recipe — the point of the screen.
 */
function validate(): boolean {
  nameError.value = name.value.trim() ? "" : "Give it a name.";
  bodyError.value = body.value.trim() ? "" : "Paste or type the recipe text.";
  return !nameError.value && !bodyError.value;
}

async function save(): Promise<void> {
  saveFailed.value = false;
  if (!validate() || servingsError.value) return;

  saving.value = true;
  try {
    // Empty fields stay off the wire; servings starts at one, so a plain paste
    // sends name, body and a serving.
    const draft: RecipeDraft = { name: name.value, body: body.value };
    if (mealType.value) draft.meal_type = mealType.value;
    const servings = toNumber(servingsText.value);
    if (servings !== null) draft.servings = servings;
    if (tags.value.length > 0) draft.tags = tags.value;
    if (ingredients.value.length > 0) draft.ingredients = ingredients.value;
    await store.createRecipe(draft);
    // Back to the collection, where the new recipe is at the top as a one-line
    // row with nothing greyed out and nothing asking for anything else.
    void router.push("/kitchencraft");
  } catch {
    // The store already routed the message into `store.error`. Nothing here
    // clears any field: the paste is the irreplaceable half.
    saveFailed.value = true;
  } finally {
    saving.value = false;
  }
}

function cancel(): void {
  void router.push("/kitchencraft");
}
</script>
