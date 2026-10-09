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
import type { Note } from "@/apps/shared-notes/types";

const note = (overrides: Partial<Note> = {}): Note => ({
  id: "n-abc12345",
  title: "Groceries",
  body: "milk",
  owner: "ana",
  members: ["ana"],
  rev: 1,
  can_manage: true,
  created_at: "2026-09-20T10:00:00Z",
  updated_at: "2026-09-20T10:05:00Z",
  ...overrides,
});

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("useSharedNotesStore — dock users", () => {
  it("fetches the platform roster for the picker", async () => {
    getMock.mockResolvedValue({ usernames: ["ana", "bo", "cy"] });
    const store = useSharedNotesStore();

    await store.fetchDockUsers();

    expect(getMock).toHaveBeenCalledWith("/auth/users");
    expect(store.dockUsers).toEqual(["ana", "bo", "cy"]);
  });

  it("reports a roster failure rather than swallowing it", async () => {
    getMock.mockRejectedValue(new Error("500: boom"));
    const store = useSharedNotesStore();

    await store.fetchDockUsers();

    expect(store.error).toContain("boom");
    expect(store.dockUsers).toEqual([]);
  });
});

describe("useSharedNotesStore — shareNote", () => {
  it("posts the usernames and adopts the returned roster", async () => {
    getMock.mockResolvedValue(note());
    const store = useSharedNotesStore();
    await store.openNote("n-abc12345");

    postMock.mockResolvedValue(note({ members: ["ana", "bo"] }));
    await store.shareNote("n-abc12345", ["bo"]);

    expect(postMock).toHaveBeenCalledWith(
      "/shared-notes/notes/n-abc12345/share",
      { usernames: ["bo"] },
    );
    expect(store.currentNote?.members).toEqual(["ana", "bo"]);
  });

  it("marks the note shared in the home list", async () => {
    getMock.mockResolvedValue([
      {
        id: "n-abc12345",
        title: "Groceries",
        owner: "ana",
        shared: false,
        updated_at: "2026-09-20T10:00:00Z",
      },
    ]);
    const store = useSharedNotesStore();
    await store.fetchNotes();

    postMock.mockResolvedValue(note({ members: ["ana", "bo"] }));
    await store.shareNote("n-abc12345", ["bo"]);

    expect(store.notes[0]?.shared).toBe(true);
  });

  it("surfaces a rejected share and leaves the roster alone", async () => {
    getMock.mockResolvedValue(note());
    const store = useSharedNotesStore();
    await store.openNote("n-abc12345");

    postMock.mockRejectedValue(new Error("422: unknown user: nobody"));
    await store.shareNote("n-abc12345", ["nobody"]);

    expect(store.error).toContain("unknown user");
    expect(store.currentNote?.members).toEqual(["ana"]);
  });
});

describe("useSharedNotesStore — removeMember", () => {
  it("deletes the member and adopts the returned roster", async () => {
    getMock.mockResolvedValue(note({ members: ["ana", "bo"] }));
    const store = useSharedNotesStore();
    await store.openNote("n-abc12345");

    delMock.mockResolvedValue(note({ members: ["ana"] }));
    await store.removeMember("n-abc12345", "bo");

    expect(delMock).toHaveBeenCalledWith(
      "/shared-notes/notes/n-abc12345/share/bo",
    );
    expect(store.currentNote?.members).toEqual(["ana"]);
  });

  it("clears the shared flag when the last member goes", async () => {
    getMock.mockResolvedValue([
      {
        id: "n-abc12345",
        title: "Groceries",
        owner: "ana",
        shared: true,
        updated_at: "2026-09-20T10:00:00Z",
      },
    ]);
    const store = useSharedNotesStore();
    await store.fetchNotes();

    delMock.mockResolvedValue(note({ members: ["ana"] }));
    await store.removeMember("n-abc12345", "bo");

    expect(store.notes[0]?.shared).toBe(false);
  });

  it("surfaces a rejected removal", async () => {
    getMock.mockResolvedValue(note({ members: ["ana", "bo"] }));
    const store = useSharedNotesStore();
    await store.openNote("n-abc12345");

    delMock.mockRejectedValue(new Error("403: only the owner can manage"));
    await store.removeMember("n-abc12345", "bo");

    expect(store.error).toContain("only the owner");
    expect(store.currentNote?.members).toEqual(["ana", "bo"]);
  });
});
