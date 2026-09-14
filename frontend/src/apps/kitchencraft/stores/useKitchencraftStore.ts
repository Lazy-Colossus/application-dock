import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import { sortRecipes } from "@/apps/kitchencraft/format";
import type {
  Recipe,
  RecipeChanges,
  RecipeDraft,
  Vocabulary,
} from "@/apps/kitchencraft/types";

// The single HTTP boundary for KitchenCraft is `useApi`; this store is the only
// place components reach the network. Every async action sets `loading` in a
// try/finally and routes failures into `error.value` — never a bare console.
//
// The whole collection (bodies included) is loaded once and held here, because
// search and filtering run client-side over it (NFR-6): typing must not cost a
// round trip, and full-text search needs the bodies anyway.
export const useKitchencraftStore = defineStore("kitchencraft", () => {
  const recipes = ref<Recipe[]>([]);
  const vocabulary = ref<Vocabulary>({ tags: [], ingredients: [], units: [] });
  const loading = ref(false);
  const error = ref<string | null>(null);
  // Distinguishes "loaded and genuinely empty" from "not fetched yet", so the
  // empty-collection state cannot flash before the first response lands.
  const loaded = ref(false);

  const isEmpty = computed(() => loaded.value && recipes.value.length === 0);

  function message(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  async function fetchCollection(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      recipes.value = sortRecipes(
        await api.get<Recipe[]>("/kitchencraft/recipes"),
      );
      loaded.value = true;
    } catch (e) {
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  // The two typeahead namespaces plus the pantry filter's category list. Kept
  // separate from the collection fetch because it also carries the shipped
  // seed, which no recipe has to mention for the filter to offer it.
  async function fetchVocabulary(): Promise<void> {
    error.value = null;
    try {
      vocabulary.value = await api.get<Vocabulary>("/kitchencraft/vocabulary");
    } catch (e) {
      error.value = message(e);
    }
  }

  /** One recipe by id, from the loaded collection or the server. */
  async function fetchRecipe(id: string): Promise<Recipe | null> {
    const held = recipes.value.find((r) => r.id === id);
    if (held) return held;

    loading.value = true;
    error.value = null;
    try {
      const recipe = await api.get<Recipe>(`/kitchencraft/recipes/${id}`);
      recipes.value = sortRecipes([...recipes.value, recipe]);
      return recipe;
    } catch (e) {
      error.value = message(e);
      return null;
    } finally {
      loading.value = false;
    }
  }

  // Rethrows so the capture screen can keep the user's paste on screen and
  // decide what to do, while `error` is also surfaced for the one-line message.
  async function createRecipe(draft: RecipeDraft): Promise<Recipe> {
    loading.value = true;
    error.value = null;
    try {
      const saved = await api.post<Recipe>("/kitchencraft/recipes", {
        ...draft,
      });
      recipes.value = sortRecipes([...recipes.value, saved]);
      return saved;
    } catch (e) {
      error.value = message(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function updateRecipe(
    id: string,
    changes: RecipeChanges,
  ): Promise<Recipe> {
    loading.value = true;
    error.value = null;
    try {
      const saved = await api.put<Recipe>(`/kitchencraft/recipes/${id}`, {
        ...changes,
      });
      recipes.value = sortRecipes(
        recipes.value.map((r) => (r.id === id ? saved : r)),
      );
      return saved;
    } catch (e) {
      error.value = message(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Toggle a favourite from the collection list.
   *
   * Optimistic and deliberately outside `loading`: the row has to fill the
   * moment it is tapped, and a global loading flag here would let a spinner or
   * a disabled state reach a list the user is still scrolling. On a failed
   * write the row reverts and the surface says so in one line.
   */
  async function toggleFavourite(id: string): Promise<void> {
    const recipe = recipes.value.find((r) => r.id === id);
    if (!recipe) return;

    const previous = recipe.favourite;
    error.value = null;
    recipes.value = sortRecipes(
      recipes.value.map((r) =>
        r.id === id ? { ...r, favourite: !previous } : r,
      ),
    );
    try {
      const saved = await api.put<Recipe>(`/kitchencraft/recipes/${id}`, {
        favourite: !previous,
      });
      recipes.value = sortRecipes(
        recipes.value.map((r) => (r.id === id ? saved : r)),
      );
    } catch (e) {
      error.value = message(e);
      recipes.value = sortRecipes(
        recipes.value.map((r) =>
          r.id === id ? { ...r, favourite: previous } : r,
        ),
      );
    }
  }

  /**
   * Set or clear a recipe's rating (Story 2.7).
   *
   * Optimistic and outside `loading`, for the same reason `toggleFavourite` is:
   * the user may be mid-scroll, and a spinner or a disabled list has no business
   * appearing under them for a one-tap mark.
   *
   * Unlike a favourite, this never re-sorts — rating is deliberately outside the
   * collection order (AC 4), so the row must not move under the finger that
   * tapped it.
   */
  async function setRating(id: string, rating: number | null): Promise<void> {
    const recipe = recipes.value.find((r) => r.id === id);
    if (!recipe) return;

    const previous = recipe.rating;
    if (previous === rating) return;

    error.value = null;
    recipes.value = recipes.value.map((r) =>
      r.id === id ? { ...r, rating } : r,
    );
    try {
      const saved = await api.put<Recipe>(`/kitchencraft/recipes/${id}`, {
        rating,
      });
      recipes.value = recipes.value.map((r) => (r.id === id ? saved : r));
    } catch (e) {
      error.value = message(e);
      recipes.value = recipes.value.map((r) =>
        r.id === id ? { ...r, rating: previous } : r,
      );
    }
  }

  async function deleteRecipe(id: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.del(`/kitchencraft/recipes/${id}`);
      // It leaves the collection, the favourites group and every filter result
      // at once, because they are all views over this one array.
      recipes.value = recipes.value.filter((r) => r.id !== id);
    } catch (e) {
      error.value = message(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  return {
    recipes,
    vocabulary,
    loading,
    error,
    loaded,
    isEmpty,
    fetchCollection,
    fetchVocabulary,
    fetchRecipe,
    createRecipe,
    updateRecipe,
    toggleFavourite,
    setRating,
    deleteRecipe,
  };
});
