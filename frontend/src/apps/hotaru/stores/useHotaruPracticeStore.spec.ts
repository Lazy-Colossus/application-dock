import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));

import { useHotaruPracticeStore } from "./useHotaruPracticeStore";

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset();
});

describe("useHotaruPracticeStore", () => {
  it("loads the overview from the scope-scoped endpoint", async () => {
    const overview = {
      scope: "lesson:L2",
      word_count: 3,
      familiarity: [2, 1, 0, 0, 0],
    };
    getMock.mockResolvedValueOnce(overview);
    const store = useHotaruPracticeStore();
    await store.loadOverview("lesson:L2", "dani");
    expect(getMock).toHaveBeenCalledWith(
      "/hotaru/practice/overview?scope=lesson%3AL2&user=dani",
    );
    expect(store.overview).toEqual(overview);
    expect(store.error).toBeNull();
  });

  it("routes API failures into error", async () => {
    getMock.mockRejectedValueOnce({ detail: "Invalid scope 'bogus'." });
    const store = useHotaruPracticeStore();
    await store.loadOverview("bogus", "dani");
    expect(store.error).toBe("Invalid scope 'bogus'.");
    expect(store.loading).toBe(false);
  });

  it("loads the queue from the scope+direction endpoint", async () => {
    const items = [{ word: { id: "a" } }, { word: { id: "b" } }];
    getMock.mockResolvedValueOnce(items);
    const store = useHotaruPracticeStore();
    await store.loadQueue("lesson:L2", "dani");
    expect(getMock).toHaveBeenCalledWith(
      "/hotaru/practice/queue?scope=lesson%3AL2&user=dani&direction=r2m",
    );
    expect(store.queue.map((i) => i.word.id)).toEqual(["a", "b"]);
    expect(store.error).toBeNull();
  });

  it("loadQueue surfaces errors", async () => {
    getMock.mockRejectedValueOnce({ detail: "Invalid scope 'x'." });
    const store = useHotaruPracticeStore();
    await store.loadQueue("x", "dani");
    expect(store.error).toBe("Invalid scope 'x'.");
    expect(store.loading).toBe(false);
  });
});
