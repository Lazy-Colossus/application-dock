<template>
  <q-page class="kitchencraft-app">
    <div class="kc-band">
      <!--
        The recipe name is this screen's heading, and it rides in the bar
        beside the shopping list (FR-14) rather than on a line of its own.
      -->
      <PageBar>
        <template v-if="recipe" #title>
          <h1 class="kc-title kc-read__name" data-testid="recipe-name">
            {{ recipe.name }}
          </h1>
        </template>
      </PageBar>

      <p v-if="store.error" class="kc-error kc-pad" data-testid="error">
        {{ store.error }}
      </p>

      <template v-if="recipe">
        <!--
          No fixed structural frame. Every block below exists only if it has
          something in it; a recipe with a name and a body shows a name and a
          body, and nothing else appears (the absence rule, UX-DR9).
        -->
        <div class="kc-read">
          <!--
            The rating is a control, not a value, so it renders whether or not
            the recipe carries one — five outlined stars for unrated, which is
            the absence rule met by showing nothing rather than a placeholder.
          -->
          <div class="kc-read__top">
            <p
              v-if="metaParts.length > 0"
              class="kc-meta"
              data-testid="recipe-meta"
            >
              {{ metaParts.join(" · ") }}
            </p>
            <RatingStars
              :model-value="recipe.rating"
              testid="recipe-rating"
              @update:model-value="rate($event)"
            />
          </div>

          <!--
            The hero. `pre-wrap` is the rendering half of the verbatim body
            contract: mixed bullets, blank lines and stray site boilerplate all
            read back exactly as pasted, with no markdown pass and no re-flow
            (UX-DR10).
          -->
          <div class="kc-recipe kc-read__body" data-testid="recipe-body">
            {{ recipe.body }}
          </div>

          <div class="kc-read__bottom">
            <div
              v-if="recipe.ingredients.length > 0"
              class="kc-read__ingredients"
            >
              <span class="kc-label">Ingredients</span>
              <!--
                One per line, in the order the cook entered them — a list to
                read down while shopping or laying things out, not a bag of
                chips to scan. Amount and unit sit in their own column so the
                quantities line up with each other.
              -->
              <ul class="kc-ingredients" data-testid="recipe-ingredients">
                <li
                  v-for="(ingredient, index) in recipe.ingredients"
                  :key="index"
                  class="kc-ingredient"
                >
                  <span class="kc-ingredient__measure">{{
                    measure(ingredient)
                  }}</span>
                  <span class="kc-ingredient__name">{{ ingredient.text }}</span>
                </li>
              </ul>
            </div>

            <div v-if="recipe.tags.length > 0" style="margin-top: 16px">
              <span class="kc-label">Tags</span>
              <ul class="kc-chips" data-testid="recipe-tags">
                <li v-for="tag in recipe.tags" :key="tag">
                  <span class="kc-chip">{{ tag }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div class="kc-foot">
          <div class="kc-actions" style="margin-top: 0">
            <button
              type="button"
              class="kc-btn"
              data-testid="edit"
              @click="goEdit()"
            >
              Edit
            </button>
            <button
              type="button"
              class="kc-btn kc-btn--quiet"
              data-testid="add-to-list"
              @click="sending = true"
            >
              Add to shopping list
            </button>
            <!--
              Delete is behind a confirmation, and the confirmation is the only
              safety net: there is no undo and no trash, by design.
            -->
            <button
              type="button"
              class="kc-btn kc-btn--danger"
              data-testid="delete"
              @click="confirming = true"
            >
              Delete
            </button>
          </div>
        </div>

        <AddToListModal
          v-if="sending"
          :ingredients="recipe.ingredients"
          @close="sending = false"
          @edit="goEdit()"
        />

        <ConfirmModal
          v-if="confirming"
          testid="delete"
          :title="`Delete ${recipe.name}?`"
          detail="This can't be undone."
          confirm-label="Delete"
          @confirm="remove()"
          @cancel="confirming = false"
        />
      </template>

      <div v-else-if="missing" class="kc-state" data-testid="missing">
        <h2 class="kc-title">That recipe isn't here.</h2>
        <p class="kc-state__lede">It may have been deleted.</p>
        <button
          type="button"
          class="kc-btn kc-btn--quiet"
          @click="goCollection()"
        >
          Back to the collection
        </button>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AddToListModal from "@/apps/kitchencraft/components/AddToListModal.vue";
import ConfirmModal from "@/apps/kitchencraft/components/ConfirmModal.vue";
import PageBar from "@/apps/kitchencraft/components/PageBar.vue";
import RatingStars from "@/apps/kitchencraft/components/RatingStars.vue";
import { formatTime } from "@/apps/kitchencraft/format";
import type { Ingredient } from "@/apps/kitchencraft/types";
import { useKitchencraftStore } from "@/apps/kitchencraft/stores/useKitchencraftStore";
import type { Recipe } from "@/apps/kitchencraft/types";
import "./../css/kitchencraft.sass";

const store = useKitchencraftStore();
const route = useRoute();
const router = useRouter();

const recipeId = String(route.params.id ?? "");
const missing = ref(false);
const confirming = ref(false);
const sending = ref(false);

// Read live from the store rather than into a local copy, so a favourite
// toggled elsewhere and an edit saved on the next screen are both reflected.
const recipe = computed<Recipe | undefined>(() =>
  store.recipes.find((r) => r.id === recipeId),
);

// Each part appears only if it has a value; the joined line is absent entirely
// when none do.
const metaParts = computed(() => {
  const current = recipe.value;
  if (!current) return [];
  const servings =
    current.servings === null ? null : `serves ${current.servings}`;
  return [
    current.meal_type,
    formatTime(current.total_time_minutes),
    servings,
    current.source,
  ].filter((part): part is string => Boolean(part));
});

onMounted(async () => {
  const found = await store.fetchRecipe(recipeId);
  if (!found) missing.value = true;
});

/** The amount and unit as one column: `200 g`, `2`, or nothing at all. */
function measure(ingredient: Ingredient): string {
  return [ingredient.amount, ingredient.unit].filter(Boolean).join(" ");
}

function rate(rating: number | null): void {
  void store.setRating(recipeId, rating);
}

function goEdit(): void {
  void router.push(`/kitchencraft/r/${recipeId}/edit`);
}

function goCollection(): void {
  void router.push("/kitchencraft");
}

async function remove(): Promise<void> {
  try {
    await store.deleteRecipe(recipeId);
    goCollection();
  } catch {
    // The store surfaced the message; the confirmation closes so the recipe is
    // readable again and nothing is left half-deleted on screen.
    confirming.value = false;
  }
}
</script>
