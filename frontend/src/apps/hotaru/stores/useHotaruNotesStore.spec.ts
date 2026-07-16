import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, patchMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  patchMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: {
    get: getMock,
    post: postMock,
    put: vi.fn(),
    patch: patchMock,
    del: vi.fn(),
  },
}));

import { useHotaruNotesStore } from "./useHotaruNotesStore";

function note(
  id: string,
  text: string,
  visibility = "shared",
  author = "dani",
) {
  return {
    id,
    word_id: "w1",
    author,
    text,
    visibility,
    created_at: "2026-01-01T00:00:00Z",
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset();
  postMock.mockReset();
  patchMock.mockReset();
});

describe("useHotaruNotesStore", () => {
  it("loads a word's notes into notesByWord", async () => {
    getMock.mockResolvedValueOnce([note("n1", "hi")]);
    const store = useHotaruNotesStore();
    await store.loadNotes("w1", "dani");
    expect(getMock).toHaveBeenCalledWith("/hotaru/words/w1/notes?user=dani");
    expect(store.notesFor("w1").map((n) => n.id)).toEqual(["n1"]);
    expect(store.error).toBeNull();
  });

  it("notesFor returns [] for an unloaded word", () => {
    const store = useHotaruNotesStore();
    expect(store.notesFor("nope")).toEqual([]);
  });

  it("addNote posts the note and appends it locally", async () => {
    const created = note("n2", "mine", "private");
    postMock.mockResolvedValueOnce(created);
    const store = useHotaruNotesStore();
    const result = await store.addNote(
      "w1",
      { text: "mine", visibility: "private" },
      "dani",
    );
    expect(postMock).toHaveBeenCalledWith("/hotaru/words/w1/notes?user=dani", {
      text: "mine",
      visibility: "private",
    });
    expect(result?.id).toBe("n2");
    expect(store.notesFor("w1").map((n) => n.id)).toEqual(["n2"]);
  });

  it("addNote surfaces ApiError.detail and returns null", async () => {
    postMock.mockRejectedValueOnce({ detail: "Note text must not be empty." });
    const store = useHotaruNotesStore();
    const result = await store.addNote(
      "w1",
      { text: "", visibility: "shared" },
      "dani",
    );
    expect(result).toBeNull();
    expect(store.error).toBe("Note text must not be empty.");
  });

  it("setVisibility patches the note and replaces it in place", async () => {
    getMock.mockResolvedValueOnce([
      note("n1", "a", "shared"),
      note("n2", "b", "shared"),
    ]);
    const store = useHotaruNotesStore();
    await store.loadNotes("w1", "dani");

    patchMock.mockResolvedValueOnce(note("n1", "a", "private"));
    const result = await store.setVisibility("w1", "n1", "private", "dani");

    expect(patchMock).toHaveBeenCalledWith("/hotaru/notes/n1?user=dani", {
      visibility: "private",
    });
    expect(result?.visibility).toBe("private");
    // Replaced in place — order preserved, no duplicate.
    expect(store.notesFor("w1").map((n) => [n.id, n.visibility])).toEqual([
      ["n1", "private"],
      ["n2", "shared"],
    ]);
  });

  it("setVisibility surfaces ApiError.detail and returns null", async () => {
    patchMock.mockRejectedValueOnce({
      detail: "Note n1 is not yours to change.",
    });
    const store = useHotaruNotesStore();
    const result = await store.setVisibility("w1", "n1", "private", "jake");
    expect(result).toBeNull();
    expect(store.error).toBe("Note n1 is not yours to change.");
  });
});
