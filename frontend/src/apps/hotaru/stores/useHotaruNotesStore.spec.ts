import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, patchMock, delMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  patchMock: vi.fn(),
  delMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: {
    get: getMock,
    post: postMock,
    put: vi.fn(),
    patch: patchMock,
    del: delMock,
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
  delMock.mockReset();
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

  it("editNote patches the text and replaces the note in place", async () => {
    getMock.mockResolvedValueOnce([note("n1", "old"), note("n2", "keep")]);
    const store = useHotaruNotesStore();
    await store.loadNotes("w1", "dani");

    patchMock.mockResolvedValueOnce(note("n1", "new text"));
    const result = await store.editNote("w1", "n1", "new text", "dani");

    expect(patchMock).toHaveBeenCalledWith("/hotaru/notes/n1?user=dani", {
      text: "new text",
    });
    expect(result?.text).toBe("new text");
    expect(store.notesFor("w1").map((n) => [n.id, n.text])).toEqual([
      ["n1", "new text"],
      ["n2", "keep"],
    ]);
  });

  it("editNote surfaces ApiError.detail and returns null", async () => {
    patchMock.mockRejectedValueOnce({ detail: "Note must not be empty." });
    const store = useHotaruNotesStore();
    const result = await store.editNote("w1", "n1", "", "dani");
    expect(result).toBeNull();
    expect(store.error).toBe("Note must not be empty.");
  });

  it("deleteNote deletes and drops the note from state", async () => {
    getMock.mockResolvedValueOnce([note("n1", "a"), note("n2", "b")]);
    const store = useHotaruNotesStore();
    await store.loadNotes("w1", "dani");

    delMock.mockResolvedValueOnce(undefined);
    const ok = await store.deleteNote("w1", "n1", "dani");

    expect(delMock).toHaveBeenCalledWith("/hotaru/notes/n1?user=dani");
    expect(ok).toBe(true);
    expect(store.notesFor("w1").map((n) => n.id)).toEqual(["n2"]);
  });

  it("loadPresence populates the has-note set", async () => {
    getMock.mockResolvedValueOnce(["w1", "w3"]);
    const store = useHotaruNotesStore();
    await store.loadPresence("dani");
    expect(getMock).toHaveBeenCalledWith("/hotaru/notes/presence?user=dani");
    expect(store.hasNote("w1")).toBe(true);
    expect(store.hasNote("w2")).toBe(false);
  });

  it("addNote lights the word's presence indicator", async () => {
    postMock.mockResolvedValueOnce(note("n1", "tip"));
    const store = useHotaruNotesStore();
    expect(store.hasNote("w1")).toBe(false);
    await store.addNote("w1", { text: "tip", visibility: "shared" }, "dani");
    expect(store.hasNote("w1")).toBe(true);
  });

  it("deleteNote returns false and sets error on failure", async () => {
    getMock.mockResolvedValueOnce([note("n1", "a")]);
    const store = useHotaruNotesStore();
    await store.loadNotes("w1", "dani");

    delMock.mockRejectedValueOnce({
      detail: "Note n1 is not yours to delete.",
    });
    const ok = await store.deleteNote("w1", "n1", "jake");
    expect(ok).toBe(false);
    expect(store.error).toBe("Note n1 is not yours to delete.");
    // State untouched on failure.
    expect(store.notesFor("w1").map((n) => n.id)).toEqual(["n1"]);
  });
});
