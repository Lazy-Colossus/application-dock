import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
import { useAuthStore } from "@/stores/useAuthStore";
import type { Note } from "@/apps/shared-notes/types";
import type { NoteEvent } from "@/apps/shared-notes/composables/useNoteEvents";

class FakeEventSource {
  static last: FakeEventSource | null = null;
  onmessage: ((m: MessageEvent<string>) => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }
  close() {
    this.closed = true;
  }
  emit(payload: NoteEvent) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent<string>);
  }
}

const note = (overrides: Partial<Note> = {}): Note => ({
  id: "n-abc12345",
  title: "Groceries",
  body: "milk",
  owner: "ana",
  members: ["ana", "bo"],
  rev: 1,
  can_manage: true,
  created_at: "2026-09-20T10:00:00Z",
  updated_at: "2026-09-20T10:05:00Z",
  ...overrides,
});

async function openStore() {
  getMock.mockResolvedValue(note());
  const store = useSharedNotesStore();
  await store.openNote("n-abc12345");
  store.subscribeToNote("n-abc12345");
  return store;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  vi.stubGlobal("EventSource", FakeEventSource);
  FakeEventSource.last = null;
  const auth = useAuthStore();
  auth.username = "ana";
  auth.token = "tok";
});

afterEach(() => vi.unstubAllGlobals());

describe("live channel — subscription lifecycle", () => {
  it("opens a stream for the note with the auth token", async () => {
    await openStore();
    expect(FakeEventSource.last?.url).toBe(
      "/api/shared-notes/notes/n-abc12345/events?token=tok",
    );
  });

  it("closes the previous stream when subscribing to another note", async () => {
    const store = await openStore();
    const first = FakeEventSource.last;

    store.subscribeToNote("n-other001");

    expect(first?.closed).toBe(true);
    expect(FakeEventSource.last).not.toBe(first);
  });

  it("unsubscribe closes the stream", async () => {
    const store = await openStore();
    store.unsubscribeFromNote();
    expect(FakeEventSource.last?.closed).toBe(true);
  });

  it("does not open a stream without a token", async () => {
    useAuthStore().token = null;
    getMock.mockResolvedValue(note());
    const store = useSharedNotesStore();
    await store.openNote("n-abc12345");
    store.subscribeToNote("n-abc12345");

    expect(FakeEventSource.last).toBeNull();
  });
});

describe("live channel — note.changed", () => {
  it("ignores my own echo", async () => {
    await openStore();
    getMock.mockClear();

    FakeEventSource.last?.emit({
      type: "note.changed",
      note_id: "n-abc12345",
      rev: 2,
      actor: "ana",
    });
    await vi.waitFor(() => expect(getMock).not.toHaveBeenCalled());
  });

  it("ignores a rev I already hold", async () => {
    await openStore();
    getMock.mockClear();

    FakeEventSource.last?.emit({
      type: "note.changed",
      note_id: "n-abc12345",
      rev: 1,
      actor: "bo",
    });
    await vi.waitFor(() => expect(getMock).not.toHaveBeenCalled());
  });

  it("refetches for another member's newer revision", async () => {
    const store = await openStore();
    getMock.mockClear();
    getMock.mockResolvedValue(note({ rev: 2, body: "milk\neggs" }));

    FakeEventSource.last?.emit({
      type: "note.changed",
      note_id: "n-abc12345",
      rev: 2,
      actor: "bo",
    });

    await vi.waitFor(() => expect(getMock).toHaveBeenCalledTimes(1));
    expect(store.currentNote?.body).toBe("milk\neggs");
  });

  it("announces the applied remote change so the editor can react", async () => {
    const store = await openStore();
    getMock.mockResolvedValue(note({ rev: 2, body: "milk\neggs" }));

    FakeEventSource.last?.emit({
      type: "note.changed",
      note_id: "n-abc12345",
      rev: 2,
      actor: "bo",
    });

    await vi.waitFor(() =>
      expect(store.remoteChange).toEqual({ rev: 2, actor: "bo" }),
    );
  });

  it("does not put the editor into a loading state while refetching", async () => {
    const store = await openStore();
    let release: (v: unknown) => void = () => {};
    getMock.mockReturnValue(new Promise((r) => (release = r)));

    FakeEventSource.last?.emit({
      type: "note.changed",
      note_id: "n-abc12345",
      rev: 2,
      actor: "bo",
    });
    expect(store.loading).toBe(false);

    release(note({ rev: 2 }));
  });
});

describe("live channel — members.changed", () => {
  it("updates the roster of the open note", async () => {
    const store = await openStore();

    FakeEventSource.last?.emit({
      type: "members.changed",
      note_id: "n-abc12345",
      members: ["ana", "bo", "cy"],
    });

    expect(store.currentNote?.members).toEqual(["ana", "bo", "cy"]);
  });
});

describe("live channel — note.closed", () => {
  it("closes for everyone when the note is deleted", async () => {
    const store = await openStore();

    FakeEventSource.last?.emit({
      type: "note.closed",
      note_id: "n-abc12345",
      reason: "deleted",
    });

    expect(store.closedReason).toBe("deleted");
  });

  it("closes only for the member who was removed", async () => {
    const store = await openStore();

    // Everyone subscribed receives the frame; only bo should act on it.
    FakeEventSource.last?.emit({
      type: "note.closed",
      note_id: "n-abc12345",
      reason: "removed",
      member: "bo",
    });

    expect(store.closedReason).toBeNull();
  });

  it("closes for me when I am the removed member", async () => {
    useAuthStore().username = "bo";
    const store = await openStore();

    FakeEventSource.last?.emit({
      type: "note.closed",
      note_id: "n-abc12345",
      reason: "removed",
      member: "bo",
    });

    expect(store.closedReason).toBe("removed");
  });

  it("drops the closed note from the home list", async () => {
    getMock.mockResolvedValue([
      {
        id: "n-abc12345",
        title: "Groceries",
        owner: "ana",
        shared: true,
        updated_at: "2026-09-20T10:05:00Z",
      },
    ]);
    const store = useSharedNotesStore();
    await store.fetchNotes();
    getMock.mockResolvedValue(note());
    await store.openNote("n-abc12345");
    store.subscribeToNote("n-abc12345");

    FakeEventSource.last?.emit({
      type: "note.closed",
      note_id: "n-abc12345",
      reason: "deleted",
    });

    expect(store.notes).toEqual([]);
  });

  it("clears a stale closed reason when another note is opened", async () => {
    const store = await openStore();
    FakeEventSource.last?.emit({
      type: "note.closed",
      note_id: "n-abc12345",
      reason: "deleted",
    });
    expect(store.closedReason).toBe("deleted");

    getMock.mockResolvedValue(note({ id: "n-other001" }));
    await store.openNote("n-other001");

    expect(store.closedReason).toBeNull();
  });
});
