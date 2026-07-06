import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));

import { useHotaruLibraryStore } from "./useHotaruLibraryStore";
import type { Word } from "@/apps/hotaru/types";

function word(id: string, lesson: string): Word {
  return {
    id,
    source: "genki_3",
    reading: "よみ",
    kanji: null,
    romaji: "yomi",
    meaning: "meaning",
    pos: "noun",
    lesson,
    visibility: "shared",
    drill_caps: ["r2m", "m2r"],
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset();
});

describe("useHotaruLibraryStore", () => {
  it("loads words via the API (no user)", async () => {
    getMock.mockResolvedValueOnce([word("a", "L1")]);
    const store = useHotaruLibraryStore();
    await store.loadWords();
    expect(getMock).toHaveBeenCalledWith("/hotaru/words");
    expect(store.words).toHaveLength(1);
    expect(store.error).toBeNull();
  });

  it("passes the active user as a query param", async () => {
    getMock.mockResolvedValueOnce([]);
    const store = useHotaruLibraryStore();
    await store.loadWords("dani");
    expect(getMock).toHaveBeenCalledWith("/hotaru/words?user=dani");
  });

  it("derives lessons ordered G, then L1..L9 numeric", async () => {
    getMock.mockResolvedValueOnce([
      word("a", "L10"),
      word("b", "L2"),
      word("c", "G"),
      word("d", "L1"),
    ]);
    const store = useHotaruLibraryStore();
    await store.loadWords();
    expect(store.lessons).toEqual(["G", "L1", "L2", "L10"]);
  });

  it("wordsByLesson filters to the given lesson", async () => {
    getMock.mockResolvedValueOnce([
      word("a", "L1"),
      word("b", "L2"),
      word("c", "L1"),
    ]);
    const store = useHotaruLibraryStore();
    await store.loadWords();
    expect(store.wordsByLesson("L1").map((w) => w.id)).toEqual(["a", "c"]);
  });

  it("routes API failures into error", async () => {
    getMock.mockRejectedValueOnce(new Error("boom"));
    const store = useHotaruLibraryStore();
    await store.loadWords();
    expect(store.error).toBe("boom");
    expect(store.loading).toBe(false);
  });
});
