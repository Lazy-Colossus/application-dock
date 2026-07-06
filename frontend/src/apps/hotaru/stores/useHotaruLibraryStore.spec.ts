import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: vi.fn(), del: vi.fn() },
}));

import { useHotaruLibraryStore } from "./useHotaruLibraryStore";
import type { Word } from "@/apps/hotaru/types";

function word(
  id: string,
  lesson: string,
  source = "genki_3",
  visibility: Word["visibility"] = "shared",
): Word {
  return {
    id,
    source,
    reading: "よみ",
    kanji: null,
    romaji: "yomi",
    meaning: "meaning",
    pos: "noun",
    lesson,
    visibility,
    drill_caps: ["r2m", "m2r"],
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset();
  postMock.mockReset();
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

  it("classifies textbook sources vs custom by user ids", async () => {
    getMock.mockResolvedValueOnce([
      word("a", "L1", "genki_3"),
      word("b", "", "dani", "shared"),
      word("c", "", "jake", "private"),
    ]);
    const store = useHotaruLibraryStore();
    await store.loadWords();
    expect(store.textbookSources(["dani", "jake"])).toEqual(["genki_3"]);
    expect(store.lessonsForSource("genki_3")).toEqual(["L1"]);
    expect(store.wordsBySourceLesson("genki_3", "L1").map((w) => w.id)).toEqual(
      ["a"],
    );
  });

  it("customWords filters by user ids and visibility", async () => {
    getMock.mockResolvedValueOnce([
      word("b", "", "dani", "shared"),
      word("c", "", "dani", "private"),
      word("d", "", "genki_3", "shared"),
    ]);
    const store = useHotaruLibraryStore();
    await store.loadWords();
    expect(
      store.customWords(["dani", "jake"], "shared").map((w) => w.id),
    ).toEqual(["b"]);
    expect(
      store.customWords(["dani", "jake"], "private").map((w) => w.id),
    ).toEqual(["c"]);
  });

  it("createWord posts to the user-scoped endpoint and reloads", async () => {
    const created = word("new", "", "dani", "shared");
    postMock.mockResolvedValueOnce(created);
    getMock.mockResolvedValueOnce([created]); // the reload
    const store = useHotaruLibraryStore();
    const result = await store.createWord(
      { reading: "ねこ", meaning: "cat" },
      "dani",
    );
    expect(postMock).toHaveBeenCalledWith("/hotaru/words?user=dani", {
      reading: "ねこ",
      meaning: "cat",
    });
    expect(result?.id).toBe("new");
    expect(store.words.map((w) => w.id)).toEqual(["new"]);
  });

  it("createWord surfaces ApiError.detail into error and returns null", async () => {
    postMock.mockRejectedValueOnce({ detail: "Reading is required." });
    const store = useHotaruLibraryStore();
    const result = await store.createWord(
      { reading: "", meaning: "x" },
      "dani",
    );
    expect(result).toBeNull();
    expect(store.error).toBe("Reading is required.");
  });
});
