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

import { useSharedNotesStore } from "./useSharedNotesStore";
import type { Note, NoteSummary } from "@/apps/shared-notes/types";

// Factories, not shared objects: the store mutates what it holds, so a shared
// instance would leak state between cases.
const summary = (): NoteSummary => ({
  id: "n-abc12345",
  title: "Groceries",
  owner: "ana",
  shared: false,
  updated_at: "2026-09-20T10:00:00Z",
});

const note = (): Note => ({
  id: "n-abc12345",
  title: "Groceries",
  body: "milk",
  owner: "ana",
  members: ["ana"],
  rev: 1,
  can_manage: true,
  created_at: "2026-09-20T10:00:00Z",
  updated_at: "2026-09-20T10:05:00Z",
});

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("useSharedNotesStore — fetchNotes", () => {
  it("loads the notes I can see", async () => {
    getMock.mockResolvedValue([summary()]);
    const store = useSharedNotesStore();

    await store.fetchNotes();

    expect(getMock).toHaveBeenCalledWith("/shared-notes/notes");
    expect(store.notes).toHaveLength(1);
    expect(store.notes[0]?.title).toBe("Groceries");
  });

  it("clears loading and routes the message into error on failure", async () => {
    getMock.mockRejectedValue(new Error("500: boom"));
    const store = useSharedNotesStore();

    await store.fetchNotes();

    expect(store.loading).toBe(false);
    expect(store.error).toContain("boom");
  });

  it("clears a previous error on a later success", async () => {
    getMock.mockRejectedValueOnce(new Error("500: boom"));
    const store = useSharedNotesStore();
    await store.fetchNotes();

    getMock.mockResolvedValue([]);
    await store.fetchNotes();

    expect(store.error).toBeNull();
  });
});

describe("useSharedNotesStore — createNote", () => {
  it("posts the title and returns the created note", async () => {
    postMock.mockResolvedValue(note());
    const store = useSharedNotesStore();

    const created = await store.createNote("Groceries");

    expect(postMock).toHaveBeenCalledWith("/shared-notes/notes", {
      title: "Groceries",
    });
    expect(created.id).toBe("n-abc12345");
  });

  it("adds the new note to the top of the list", async () => {
    getMock.mockResolvedValue([
      { ...summary(), id: "n-older001", title: "Older" },
    ]);
    const store = useSharedNotesStore();
    await store.fetchNotes();

    postMock.mockResolvedValue(note());
    await store.createNote("Groceries");

    expect(store.notes.map((n) => n.id)).toEqual(["n-abc12345", "n-older001"]);
  });

  it("surfaces the error AND rethrows so the caller can skip navigating", async () => {
    postMock.mockRejectedValue(new Error("422: title must not be blank"));
    const store = useSharedNotesStore();

    await expect(store.createNote("  ")).rejects.toThrow();
    expect(store.error).toContain("title must not be blank");
  });
});

describe("useSharedNotesStore — deleteNote", () => {
  it("deletes and drops the note from the list", async () => {
    getMock.mockResolvedValue([summary()]);
    const store = useSharedNotesStore();
    await store.fetchNotes();

    delMock.mockResolvedValue(undefined);
    await store.deleteNote("n-abc12345");

    expect(delMock).toHaveBeenCalledWith("/shared-notes/notes/n-abc12345");
    expect(store.notes).toEqual([]);
  });

  it("keeps the note in the list when the delete fails", async () => {
    getMock.mockResolvedValue([summary()]);
    const store = useSharedNotesStore();
    await store.fetchNotes();

    delMock.mockRejectedValue(new Error("403: only the owner can delete"));
    await store.deleteNote("n-abc12345");

    expect(store.notes).toHaveLength(1);
    expect(store.error).toContain("only the owner");
  });
});
