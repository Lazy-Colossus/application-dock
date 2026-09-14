<template>
  <q-page class="kitchencraft-app">
    <div class="kc-band">
      <PageBar title="KitchenCraft">
        <!--
          Capture stays reachable without scrolling: with a collection of any
          size a footer button is below the fold the moment the page opens.
          The empty state keeps its own block button instead — there is no list
          to sit above, and the invitation is the whole screen there.
        -->
        <button
          v-if="store.loaded && !store.isEmpty"
          type="button"
          class="kc-btn"
          data-testid="add-recipe"
          @click="goCapture()"
        >
          Add a recipe
        </button>
      </PageBar>

      <p v-if="store.error" class="kc-error kc-pad" data-testid="error">
        {{ store.error }}
      </p>

      <!--
        Empty collection: no search field and no filter bar, because there is
        nothing to search or filter. Type, rule and spacing carry it — never a
        bare panel (UX-DR13).
      -->
      <div v-if="store.isEmpty" class="kc-state" data-testid="empty-collection">
        <h2 class="kc-title">No recipes yet.</h2>
        <p class="kc-state__lede">
          Paste a name and the text and it's saved. Nothing else is required.
        </p>
        <button
          type="button"
          class="kc-btn kc-btn--block"
          data-testid="add-recipe"
          @click="goCapture()"
        >
          Add a recipe
        </button>
      </div>

      <template v-else-if="store.loaded">
        <FilterBar
          v-model="filters"
          :tags-in-use="tagsInUse"
          :categories-in-use="categoriesInUse"
          :all-categories="store.vocabulary.ingredient_categories"
          :count-label="countLabel"
          :any-active="anyActive"
          @clear-all="clearAll"
        />

        <!--
          Zero results explain WHY nothing matched — each active filter with the
          count it would return on its own — instead of only offering the exit
          (UX-DR12).
        -->
        <!--
          Favourites-only with nothing in it gets its own state and NO button:
          the action is on the rows behind (UX-DR13).
        -->
        <div
          v-if="results.length === 0 && onlyFavourites"
          class="kc-state"
          data-testid="empty-favourites"
        >
          <h2 class="kc-title">No favourites yet.</h2>
          <p class="kc-state__lede">Tap the star on any recipe.</p>
        </div>

        <div
          v-else-if="results.length === 0"
          class="kc-state"
          data-testid="zero-results"
        >
          <h2 class="kc-title">Nothing matches all of these.</h2>
          <ul class="kc-why" style="margin-top: 16px">
            <li
              v-for="reason in reasons"
              :key="`${reason.kind}-${reason.value}`"
            >
              <button
                type="button"
                class="kc-why__row"
                :data-testid="`clear-${reason.kind}-${reason.value}`"
                @click="clearOne(reason)"
              >
                <span>{{ reason.value }}</span>
                <span class="kc-meta">{{ reason.count }} on its own</span>
              </button>
            </li>
          </ul>
          <div style="margin-top: 24px">
            <button
              type="button"
              class="kc-btn kc-btn--quiet"
              data-testid="clear-filters-zero"
              @click="clearAll()"
            >
              Clear filters
            </button>
          </div>
        </div>

        <ul v-else class="kc-rows kc-cols" data-testid="rows">
          <RecipeRow
            v-for="recipe in results"
            :key="recipe.id"
            :recipe="recipe"
            @open="open(recipe.id)"
            @toggle-favourite="store.toggleFavourite(recipe.id)"
            @rate="store.setRating(recipe.id, $event)"
          />
        </ul>
      </template>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import FilterBar from "@/apps/kitchencraft/components/FilterBar.vue";
import PageBar from "@/apps/kitchencraft/components/PageBar.vue";
import RecipeRow from "@/apps/kitchencraft/components/RecipeRow.vue";
import { useCollectionFilters } from "@/apps/kitchencraft/composables/useCollectionFilters";
import { useKitchencraftStore } from "@/apps/kitchencraft/stores/useKitchencraftStore";
import "./../css/kitchencraft.sass";

const store = useKitchencraftStore();
const router = useRouter();

const recipes = computed(() => store.recipes);
const {
  filters,
  results,
  anyActive,
  activeCount,
  countLabel,
  reasons,
  tagsInUse,
  categoriesInUse,
  clearOne,
  clearAll,
} = useCollectionFilters(recipes);

// Favourites-only on its own has its own empty state; combined with anything
// else, an empty result is a filter combination that needs explaining.
const onlyFavourites = computed(
  () => filters.value.favouritesOnly && activeCount.value === 1,
);

onMounted(() => {
  void store.fetchCollection();
  void store.fetchVocabulary();
});

function goCapture(): void {
  void router.push("/kitchencraft/new");
}

function open(id: string): void {
  void router.push(`/kitchencraft/r/${id}`);
}
</script>
