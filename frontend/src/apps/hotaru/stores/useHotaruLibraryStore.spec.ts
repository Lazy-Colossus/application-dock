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
  putMock.mockReset();
  delMock.mockReset();
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

  it("deleteWord removes the word locally and reloads", async () => {
    getMock.mockResolvedValueOnce([
      word("a", "", "dani"),
      word("b", "", "dani"),
    ]);
    delMock.mockResolvedValueOnce(undefined);
    getMock.mockResolvedValueOnce([word("b", "", "dani")]); // the reload
    const store = useHotaruLibraryStore();
    await store.loadWords("dani");
    const ok = await store.deleteWord("a", "dani");
    expect(ok).toBe(true);
    expect(delMock).toHaveBeenCalledWith("/hotaru/words/a?user=dani");
    expect(store.words.map((w) => w.id)).toEqual(["b"]);
  });

  it("deleteWord surfaces ApiError.detail and returns false", async () => {
    delMock.mockRejectedValueOnce({ detail: "Word a not found." });
    const store = useHotaruLibraryStore();
    const ok = await store.deleteWord("a", "dani");
    expect(ok).toBe(false);
    expect(store.error).toBe("Word a not found.");
  });

  it("updateWord PUTs and replaces the word locally", async () => {
    getMock.mockResolvedValueOnce([word("a", "", "dani")]);
    const updated = { ...word("a", "", "dani"), meaning: "kitty" };
    putMock.mockResolvedValueOnce(updated);
    getMock.mockResolvedValueOnce([updated]); // the reload
    const store = useHotaruLibraryStore();
    await store.loadWords("dani");
    const result = await store.updateWord(
      "a",
      { reading: "よみ", meaning: "kitty" },
      "dani",
    );
    expect(putMock).toHaveBeenCalledWith("/hotaru/words/a?user=dani", {
      reading: "よみ",
      meaning: "kitty",
    });
    expect(result?.meaning).toBe("kitty");
    expect(store.words[0].meaning).toBe("kitty");
  });

  it("wordById finds a loaded word", async () => {
    getMock.mockResolvedValueOnce([word("a", "L1")]);
    const store = useHotaruLibraryStore();
    await store.loadWords();
    expect(store.wordById("a")?.id).toBe("a");
    expect(store.wordById("nope")).toBeUndefined();
  });

  // --- topics ---------------------------------------------------------------

  function topic(id: string, name: string, word_ids: string[] = []) {
    return { id, name, word_ids };
  }

  it("loadTopics fetches the shared topics", async () => {
    getMock.mockResolvedValueOnce([topic("t1", "Food", ["a"])]);
    const store = useHotaruLibraryStore();
    await store.loadTopics();
    expect(getMock).toHaveBeenCalledWith("/hotaru/topics");
    expect(store.topics.map((t) => t.id)).toEqual(["t1"]);
  });

  it("createTopic posts and reflects the new topic locally", async () => {
    postMock.mockResolvedValueOnce(topic("t2", "Verbs"));
    const store = useHotaruLibraryStore();
    const created = await store.createTopic("Verbs");
    expect(postMock).toHaveBeenCalledWith("/hotaru/topics", { name: "Verbs" });
    expect(created?.id).toBe("t2");
    expect(store.topics.map((t) => t.id)).toEqual(["t2"]);
  });

  it("assignWord posts to the surgical endpoint and stores the returned topic", async () => {
    getMock.mockResolvedValueOnce([topic("t1", "Food", [])]);
    postMock.mockResolvedValueOnce(topic("t1", "Food", ["a"]));
    const store = useHotaruLibraryStore();
    await store.loadTopics();
    const ok = await store.assignWord("t1", "a", "dani");
    expect(ok).toBe(true);
    expect(postMock).toHaveBeenCalledWith(
      "/hotaru/topics/t1/words/a?user=dani",
    );
    expect(store.topicById("t1")?.word_ids).toEqual(["a"]);
  });

  it("unassignWord deletes and removes membership locally", async () => {
    getMock.mockResolvedValueOnce([topic("t1", "Food", ["a", "b"])]);
    delMock.mockResolvedValueOnce(undefined);
    const store = useHotaruLibraryStore();
    await store.loadTopics();
    const ok = await store.unassignWord("t1", "a", "dani");
    expect(ok).toBe(true);
    expect(delMock).toHaveBeenCalledWith("/hotaru/topics/t1/words/a?user=dani");
    expect(store.topicById("t1")?.word_ids).toEqual(["b"]);
  });

  it("assignWord surfaces ApiError.detail and returns false", async () => {
    postMock.mockRejectedValueOnce({ detail: "Not found: t-x." });
    const store = useHotaruLibraryStore();
    const ok = await store.assignWord("t-x", "a", "dani");
    expect(ok).toBe(false);
    expect(store.error).toBe("Not found: t-x.");
  });

  it("topicsForWord and wordsForTopic intersect membership with loaded data", async () => {
    getMock.mockResolvedValueOnce([word("a", "L1"), word("b", "L2")]); // words
    getMock.mockResolvedValueOnce([topic("t1", "Food", ["a"])]); // topics
    const store = useHotaruLibraryStore();
    await store.loadWords();
    await store.loadTopics();
    expect(store.topicsForWord("a").map((t) => t.id)).toEqual(["t1"]);
    expect(store.topicsForWord("b")).toEqual([]);
    expect(store.wordsForTopic("t1").map((w) => w.id)).toEqual(["a"]);
    expect(store.wordsForTopic("nope")).toEqual([]);
  });
});
