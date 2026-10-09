import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

// The fake lives inside `vi.hoisted` because `vi.mock` is hoisted above any
// top-level declaration — a plain `class` here is not initialised in time.
const { getMock, postMock, putMock, delMock, FakeApiError } = vi.hoisted(
  () => ({
    getMock: vi.fn(),
    postMock: vi.fn(),
    putMock: vi.fn(),
    delMock: vi.fn(),
    FakeApiError: class extends Error {
      status: number;
      detail: string;
      constructor(status: number, detail: string) {
        super(`${status}: ${detail}`);
        this.status = status;
        this.detail = detail;
      }
    },
  }),
);
vi.mock("@/composables/useApi", () => ({
  ApiError: FakeApiError,
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

describe("useSharedNotesStore — openNote", () => {
  it("loads the note into currentNote", async () => {
    getMock.mockResolvedValue(note());
    const store = useSharedNotesStore();

    await store.openNote("n-abc12345");

    expect(getMock).toHaveBeenCalledWith("/shared-notes/notes/n-abc12345");
    expect(store.currentNote?.body).toBe("milk");
    expect(store.notFound).toBe(false);
  });

  it("flags notFound for a 404 rather than shouting an error", async () => {
    getMock.mockRejectedValue(new FakeApiError(404, "Note not found"));
    const store = useSharedNotesStore();

    await store.openNote("n-missing0");

    expect(store.notFound).toBe(true);
    expect(store.currentNote).toBeNull();
  });

  it("treats a non-404 failure as an error, not a missing note", async () => {
    getMock.mockRejectedValue(new FakeApiError(500, "boom"));
    const store = useSharedNotesStore();

    await store.openNote("n-abc12345");

    expect(store.notFound).toBe(false);
    expect(store.error).toContain("boom");
  });

  it("clears a stale notFound when a later open succeeds", async () => {
    getMock.mockRejectedValueOnce(new FakeApiError(404, "Note not found"));
    const store = useSharedNotesStore();
    await store.openNote("n-missing0");

    getMock.mockResolvedValue(note());
    await store.openNote("n-abc12345");

    expect(store.notFound).toBe(false);
  });
});

describe("useSharedNotesStore — saveNote", () => {
  it("puts only the supplied fields", async () => {
    putMock.mockResolvedValue(note());
    const store = useSharedNotesStore();

    await store.saveNote("n-abc12345", { body: "milk\neggs" });

    expect(putMock).toHaveBeenCalledWith("/shared-notes/notes/n-abc12345", {
      body: "milk\neggs",
    });
  });

  it("persists an emptied body as a real value", async () => {
    putMock.mockResolvedValue({ ...note(), body: "" });
    const store = useSharedNotesStore();

    await store.saveNote("n-abc12345", { body: "" });

    expect(putMock).toHaveBeenCalledWith("/shared-notes/notes/n-abc12345", {
      body: "",
    });
  });

  it("tracks saving separately from loading so the editor stays responsive", async () => {
    let release: (v: unknown) => void = () => {};
    putMock.mockReturnValue(new Promise((r) => (release = r)));
    const store = useSharedNotesStore();

    const pending = store.saveNote("n-abc12345", { body: "x" });
    expect(store.saving).toBe(true);
    expect(store.loading).toBe(false);

    release(note());
    await pending;
    expect(store.saving).toBe(false);
  });

  it("advances rev from the server response", async () => {
    getMock.mockResolvedValue(note());
    const store = useSharedNotesStore();
    await store.openNote("n-abc12345");

    putMock.mockResolvedValue({ ...note(), rev: 2, body: "milk\neggs" });
    await store.saveNote("n-abc12345", { body: "milk\neggs" });

    expect(store.currentNote?.rev).toBe(2);
  });

  it("reports failure to the caller and keeps the last good note", async () => {
    getMock.mockResolvedValue(note());
    const store = useSharedNotesStore();
    await store.openNote("n-abc12345");

    putMock.mockRejectedValue(new FakeApiError(422, "title must not be blank"));
    const ok = await store.saveNote("n-abc12345", { title: "  " });

    expect(ok).toBe(false);
    expect(store.error).toContain("title must not be blank");
    expect(store.currentNote?.title).toBe("Groceries");
  });

  it("returns true on a successful save", async () => {
    putMock.mockResolvedValue(note());
    const store = useSharedNotesStore();

    expect(await store.saveNote("n-abc12345", { body: "x" })).toBe(true);
  });

  it("keeps the home list's summary in step with a saved title", async () => {
    getMock.mockResolvedValue([summary()]);
    const store = useSharedNotesStore();
    await store.fetchNotes();

    putMock.mockResolvedValue({ ...note(), title: "Shopping" });
    await store.saveNote("n-abc12345", { title: "Shopping" });

    expect(store.notes[0]?.title).toBe("Shopping");
  });
});
