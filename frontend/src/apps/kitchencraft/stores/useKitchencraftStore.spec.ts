import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, putMock, delMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: putMock, del: delMock },
}));

import { useKitchencraftStore } from "@/apps/kitchencraft/stores/useKitchencraftStore";
import { recipe, resetRecipeFixture } from "@/apps/kitchencraft/recipe.fixture";

beforeEach(() => {
  setActivePinia(createPinia());
  resetRecipeFixture();
  vi.clearAllMocks();
});

describe("fetchCollection", () => {
  it("loads the collection in collection order", async () => {
    const a = recipe({ name: "a" });
    const b = recipe({ name: "b", favourite: true });
    getMock.mockResolvedValueOnce([a, b]);

    const store = useKitchencraftStore();
    await store.fetchCollection();

    expect(getMock).toHaveBeenCalledWith("/kitchencraft/recipes");
    expect(store.recipes.map((r) => r.name)).toEqual(["b", "a"]);
    expect(store.loaded).toBe(true);
  });

  it("clears loading in a finally even when the request fails", async () => {
    getMock.mockRejectedValueOnce(new Error("Network error"));

    const store = useKitchencraftStore();
    await store.fetchCollection();

    expect(store.loading).toBe(false);
    expect(store.error).toBe("Network error");
    // Not `loaded`, so the empty-collection state cannot be shown off a failure.
    expect(store.loaded).toBe(false);
  });

  it("distinguishes a genuinely empty collection from an unfetched one", async () => {
    const store = useKitchencraftStore();
    expect(store.isEmpty).toBe(false);

    getMock.mockResolvedValueOnce([]);
    await store.fetchCollection();
    expect(store.isEmpty).toBe(true);
  });
});

describe("fetchVocabulary", () => {
  it("loads the namespaces, kept apart", async () => {
    getMock.mockResolvedValueOnce({
      tags: ["cheap"],
      ingredients: ["feta"],
      units: ["g", "tbsp"],
    });

    const store = useKitchencraftStore();
    await store.fetchVocabulary();

    expect(getMock).toHaveBeenCalledWith("/kitchencraft/vocabulary");
    expect(store.vocabulary.tags).toEqual(["cheap"]);
    expect(store.vocabulary.ingredients).toEqual(["feta"]);
    expect(store.vocabulary.units).toEqual(["g", "tbsp"]);
  });
});

describe("fetchRecipe", () => {
  it("returns a recipe already loaded without a round trip", async () => {
    const held = recipe();
    getMock.mockResolvedValueOnce([held]);
    const store = useKitchencraftStore();
    await store.fetchCollection();
    getMock.mockClear();

    expect(await store.fetchRecipe(held.id)).toEqual(held);
    expect(getMock).not.toHaveBeenCalled();
  });

  it("fetches one recipe on a direct arrival", async () => {
    const direct = recipe();
    getMock.mockResolvedValueOnce(direct);

    const store = useKitchencraftStore();
    expect(await store.fetchRecipe(direct.id)).toEqual(direct);
    expect(getMock).toHaveBeenCalledWith(`/kitchencraft/recipes/${direct.id}`);
    expect(store.recipes).toHaveLength(1);
  });

  it("returns null and surfaces the error for an unknown id", async () => {
    getMock.mockRejectedValueOnce(new Error("404: Recipe not found"));

    const store = useKitchencraftStore();
    expect(await store.fetchRecipe("r-nope")).toBeNull();
    expect(store.error).toContain("Recipe not found");
  });
});

describe("createRecipe", () => {
  it("posts the draft and inserts the saved recipe in order", async () => {
    const saved = recipe({ name: "Pumpkin dal" });
    postMock.mockResolvedValueOnce(saved);

    const store = useKitchencraftStore();
    const result = await store.createRecipe({
      name: "Pumpkin dal",
      body: "Simmer.",
    });

    expect(postMock).toHaveBeenCalledWith("/kitchencraft/recipes", {
      name: "Pumpkin dal",
      body: "Simmer.",
    });
    expect(result).toEqual(saved);
    expect(store.recipes).toHaveLength(1);
  });

  it("rethrows so the capture screen can keep the paste on screen", async () => {
    postMock.mockRejectedValueOnce(new Error("422: name must not be empty"));

    const store = useKitchencraftStore();
    await expect(store.createRecipe({ name: "", body: "x" })).rejects.toThrow();
    expect(store.error).toContain("name must not be empty");
    expect(store.recipes).toHaveLength(0);
    expect(store.loading).toBe(false);
  });
});

describe("updateRecipe", () => {
  it("puts the changes and replaces the recipe in place", async () => {
    const before = recipe({ name: "old" });
    getMock.mockResolvedValueOnce([before]);
    const store = useKitchencraftStore();
    await store.fetchCollection();

    putMock.mockResolvedValueOnce({ ...before, name: "new" });
    await store.updateRecipe(before.id, { name: "new" });

    expect(putMock).toHaveBeenCalledWith(`/kitchencraft/recipes/${before.id}`, {
      name: "new",
    });
    expect(store.recipes[0].name).toBe("new");
  });

  it("rethrows on a rejected save and leaves the loaded recipe alone", async () => {
    const before = recipe({ name: "old" });
    getMock.mockResolvedValueOnce([before]);
    const store = useKitchencraftStore();
    await store.fetchCollection();

    putMock.mockRejectedValueOnce(new Error("422: servings must be positive"));
    await expect(
      store.updateRecipe(before.id, { servings: 0 }),
    ).rejects.toThrow();
    expect(store.recipes[0].name).toBe("old");
  });
});

describe("toggleFavourite", () => {
  it("fills the row immediately, before the request resolves, without moving it", async () => {
    const older = recipe({ name: "older" });
    const newer = recipe({ name: "newer" });
    getMock.mockResolvedValueOnce([older, newer]);
    const store = useKitchencraftStore();
    await store.fetchCollection();
    expect(store.recipes.map((r) => r.name)).toEqual(["newer", "older"]);

    // A request that never settles: the optimistic state is what is asserted.
    putMock.mockReturnValueOnce(new Promise(() => {}));
    void store.toggleFavourite(older.id);

    // The mark fills; the order does not change. Favourites are lifted when the
    // collection loads, not re-derived on every tap.
    expect(store.recipes.map((r) => r.name)).toEqual(["newer", "older"]);
    expect(store.recipes.find((r) => r.id === older.id)?.favourite).toBe(true);
  });

  it("still lifts favourites above everything on the next load", async () => {
    const older = recipe({ name: "older", favourite: true });
    const newer = recipe({ name: "newer" });
    getMock.mockResolvedValueOnce([newer, older]);
    const store = useKitchencraftStore();
    await store.fetchCollection();

    expect(store.recipes.map((r) => r.name)).toEqual(["older", "newer"]);
  });

  it("does not set the global loading flag, so a scrolling list is never blocked", async () => {
    const only = recipe();
    getMock.mockResolvedValueOnce([only]);
    const store = useKitchencraftStore();
    await store.fetchCollection();

    putMock.mockReturnValueOnce(new Promise(() => {}));
    void store.toggleFavourite(only.id);
    expect(store.loading).toBe(false);
  });

  it("reverts the row and says so when the write fails", async () => {
    const only = recipe();
    getMock.mockResolvedValueOnce([only]);
    const store = useKitchencraftStore();
    await store.fetchCollection();

    putMock.mockRejectedValueOnce(new Error("Network error"));
    await store.toggleFavourite(only.id);

    expect(store.recipes[0].favourite).toBe(false);
    expect(store.error).toBe("Network error");
  });

  it("un-favourites an already-favourite recipe", async () => {
    const only = recipe({ favourite: true });
    getMock.mockResolvedValueOnce([only]);
    const store = useKitchencraftStore();
    await store.fetchCollection();

    putMock.mockResolvedValueOnce({ ...only, favourite: false });
    await store.toggleFavourite(only.id);

    expect(putMock).toHaveBeenCalledWith(`/kitchencraft/recipes/${only.id}`, {
      favourite: false,
    });
    expect(store.recipes[0].favourite).toBe(false);
  });

  it("is a no-op for an id it does not hold", async () => {
    const store = useKitchencraftStore();
    await store.toggleFavourite("r-nope");
    expect(putMock).not.toHaveBeenCalled();
  });
});

describe("deleteRecipe", () => {
  it("removes the recipe from every view at once", async () => {
    const keep = recipe({ name: "keep" });
    const drop = recipe({ name: "drop", favourite: true });
    getMock.mockResolvedValueOnce([keep, drop]);
    const store = useKitchencraftStore();
    await store.fetchCollection();

    delMock.mockResolvedValueOnce(undefined);
    await store.deleteRecipe(drop.id);

    expect(delMock).toHaveBeenCalledWith(`/kitchencraft/recipes/${drop.id}`);
    expect(store.recipes.map((r) => r.name)).toEqual(["keep"]);
  });

  it("keeps the recipe and rethrows when the delete fails", async () => {
    const only = recipe();
    getMock.mockResolvedValueOnce([only]);
    const store = useKitchencraftStore();
    await store.fetchCollection();

    delMock.mockRejectedValueOnce(new Error("Network error"));
    await expect(store.deleteRecipe(only.id)).rejects.toThrow();
    expect(store.recipes).toHaveLength(1);
  });
});

describe("setRating", () => {
  // The file's own idiom: seed the collection through a mocked fetch, so the
  // store is exercised the way the pages exercise it.
  async function loadedStore(recipes: ReturnType<typeof recipe>[]) {
    getMock.mockResolvedValueOnce(recipes);
    const store = useKitchencraftStore();
    await store.fetchCollection();
    return store;
  }

  it("fills the stars before the request resolves", async () => {
    const store = await loadedStore([recipe({ name: "Dal" })]);
    const id = store.recipes[0].id;
    // Never settles, so anything asserted below happened optimistically.
    putMock.mockReturnValueOnce(new Promise(() => {}));

    void store.setRating(id, 4);

    expect(store.recipes[0].rating).toBe(4);
    // Same deviation from the store contract as toggleFavourite, and for the
    // same reason: no spinner may reach a list the user is scrolling.
    expect(store.loading).toBe(false);
  });

  it("sends the rating to the API", async () => {
    const store = await loadedStore([recipe()]);
    const id = store.recipes[0].id;
    putMock.mockResolvedValueOnce({ ...store.recipes[0], rating: 2 });

    await store.setRating(id, 2);

    expect(putMock).toHaveBeenCalledWith(`/kitchencraft/recipes/${id}`, {
      rating: 2,
    });
  });

  it("sends null to clear", async () => {
    const store = await loadedStore([recipe({ rating: 3 })]);
    const id = store.recipes[0].id;
    putMock.mockResolvedValueOnce({ ...store.recipes[0], rating: null });

    await store.setRating(id, null);

    expect(putMock).toHaveBeenCalledWith(`/kitchencraft/recipes/${id}`, {
      rating: null,
    });
    expect(store.recipes[0].rating).toBeNull();
  });

  it("reverts and reports on a failed write", async () => {
    const store = await loadedStore([recipe({ rating: 2 })]);
    const id = store.recipes[0].id;
    putMock.mockRejectedValueOnce(new Error("Offline"));

    await store.setRating(id, 5);

    expect(store.recipes[0].rating).toBe(2);
    expect(store.error).toBe("Offline");
  });

  it("never re-orders the collection", async () => {
    // Rating is deliberately outside the collection order, so the row must not
    // move under the finger that tapped it.
    const store = await loadedStore([
      recipe({ name: "a" }),
      recipe({ name: "b" }),
      recipe({ name: "c" }),
    ]);
    const before = store.recipes.map((r) => r.name);
    const target = store.recipes[2];
    putMock.mockResolvedValueOnce({ ...target, rating: 5 });

    await store.setRating(target.id, 5);

    expect(store.recipes.map((r) => r.name)).toEqual(before);
  });

  it("leaves the favourite flag alone", async () => {
    const store = await loadedStore([recipe({ favourite: true })]);
    const id = store.recipes[0].id;
    putMock.mockResolvedValueOnce({ ...store.recipes[0], rating: 1 });

    await store.setRating(id, 1);

    expect(store.recipes[0].favourite).toBe(true);
  });

  it("is a no-op for an unknown id", async () => {
    const store = await loadedStore([recipe()]);
    await store.setRating("r-nope", 3);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("is a no-op when the value has not changed", async () => {
    const store = await loadedStore([recipe({ rating: 3 })]);
    await store.setRating(store.recipes[0].id, 3);
    expect(putMock).not.toHaveBeenCalled();
  });
});
