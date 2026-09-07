import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, putMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: {
    get: getMock,
    post: vi.fn(),
    put: putMock,
    del: vi.fn(),
  },
}));

// Capture the handlers the store registers so a test can fire live events.
const { useSheetEventsMock, captured, closeMock } = vi.hoisted(() => {
  const captured: { handlers: Record<string, (e: unknown) => void> | null } = {
    handlers: null,
  };
  const closeMock = vi.fn();
  const useSheetEventsMock = vi.fn(
    (
      _id: string,
      _token: string,
      handlers: Record<string, (e: unknown) => void>,
    ) => {
      captured.handlers = handlers;
      return { close: closeMock };
    },
  );
  return { useSheetEventsMock, captured, closeMock };
});
vi.mock("@/apps/listies/composables/useSheetEvents", () => ({
  useSheetEvents: useSheetEventsMock,
}));

import { useListiesStore } from "./useListiesStore";
import { useAuthStore } from "@/stores/useAuthStore";
import type { SheetView } from "@/apps/listies/types";

// A shared sheet view with two tabs, owned by alice, shared with bob, at rev 1.
const view = (over: Partial<SheetView> = {}): SheetView => ({
  id: "s-1",
  name: "Trip",
  created_at: "2026-09-01T00:00:00Z",
  shared: true,
  owner: "alice",
  members: ["alice", "bob"],
  rev: 1,
  can_manage: false,
  tabs: [
    {
      id: "tb-1",
      name: "One",
      order: 0,
      columns: [{ id: "c-1", name: "Item", type: "text", order: 0 }],
      rows: [],
    },
    {
      id: "tb-2",
      name: "Two",
      order: 1,
      columns: [{ id: "c-2", name: "Item", type: "text", order: 0 }],
      rows: [],
    },
  ],
  ...over,
});

function asUser(username: string): void {
  const auth = useAuthStore();
  auth.token = "jwt-token";
  auth.username = username;
}

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset();
  putMock.mockReset();
  useSheetEventsMock.mockClear();
  closeMock.mockClear();
  captured.handlers = null;
});

describe("useListiesStore — live subscription", () => {
  it("subscribes when a shared sheet opens and exposes collab state", async () => {
    asUser("bob");
    getMock.mockResolvedValue(view());
    const store = useListiesStore();

    await store.fetchSheet("s-1");

    expect(useSheetEventsMock).toHaveBeenCalledWith(
      "s-1",
      "jwt-token",
      expect.any(Object),
    );
    expect(store.shared).toBe(true);
    expect(store.owner).toBe("alice");
    expect(store.members).toEqual(["alice", "bob"]);
    expect(store.rev).toBe(1);
    expect(store.canManage).toBe(false);
  });

  it("does not subscribe for a private sheet", async () => {
    asUser("bob");
    getMock.mockResolvedValue(
      view({ shared: false, owner: null, members: null, rev: null }),
    );
    const store = useListiesStore();

    await store.fetchSheet("s-1");

    expect(useSheetEventsMock).not.toHaveBeenCalled();
    expect(store.shared).toBe(false);
  });

  it("closeSheet tears down the subscription and clears state", async () => {
    asUser("bob");
    getMock.mockResolvedValue(view());
    const store = useListiesStore();
    await store.fetchSheet("s-1");

    store.closeSheet();

    expect(closeMock).toHaveBeenCalled();
    expect(store.currentSheet).toBeNull();
    expect(store.shared).toBe(false);
  });
});

describe("useListiesStore — reconciliation on sheet.changed", () => {
  it("refetches on a newer rev from another member, preserving the active tab", async () => {
    asUser("bob");
    getMock.mockResolvedValue(view());
    const store = useListiesStore();
    await store.fetchSheet("s-1");
    store.setActiveTab("tb-2"); // I am looking at the second tab

    // A newer revision arrives with a fresh row, authored by alice.
    const next = view({ rev: 2 });
    next.tabs[0]!.rows.push({
      id: "r-1",
      order: 0,
      cells: {},
      created_at: "x",
      updated_at: "x",
    });
    getMock.mockResolvedValue(next);

    captured.handlers!.onChanged!({
      type: "sheet.changed",
      sheet_id: "s-1",
      rev: 2,
      actor: "alice",
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.rev).toBe(2);
    expect(store.currentSheet?.tabs[0]!.rows).toHaveLength(1);
    expect(store.activeTabId).toBe("tb-2"); // still on my tab
  });

  it("ignores my own change (actor === me)", async () => {
    asUser("bob");
    getMock.mockResolvedValue(view());
    const store = useListiesStore();
    await store.fetchSheet("s-1");
    getMock.mockClear();

    captured.handlers!.onChanged!({
      type: "sheet.changed",
      sheet_id: "s-1",
      rev: 2,
      actor: "bob",
    });
    await Promise.resolve();

    expect(getMock).not.toHaveBeenCalled();
    expect(store.rev).toBe(1);
  });

  it("ignores an event for a rev I already hold", async () => {
    asUser("bob");
    getMock.mockResolvedValue(view({ rev: 5 }));
    const store = useListiesStore();
    await store.fetchSheet("s-1");
    getMock.mockClear();

    captured.handlers!.onChanged!({
      type: "sheet.changed",
      sheet_id: "s-1",
      rev: 5,
      actor: "alice",
    });
    await Promise.resolve();

    expect(getMock).not.toHaveBeenCalled();
  });

  it("defers a live refetch while a cell write is in flight, then runs it", async () => {
    asUser("bob");
    getMock.mockResolvedValue(view());
    const store = useListiesStore();
    await store.fetchSheet("s-1");
    store.setActiveTab("tb-1");
    // Give the active tab a row to edit.
    store.currentSheet!.tabs[0]!.rows.push({
      id: "r-1",
      order: 0,
      cells: {},
      created_at: "x",
      updated_at: "x",
    });

    // Hold the cell write open so it is "in flight" when the event arrives.
    let resolvePut: (v: unknown) => void = () => {};
    putMock.mockImplementation(() => new Promise((res) => (resolvePut = res)));
    const commit = store.commitCell("r-1", "c-1", "hello");

    getMock.mockClear();
    getMock.mockResolvedValue(view({ rev: 2 }));
    captured.handlers!.onChanged!({
      type: "sheet.changed",
      sheet_id: "s-1",
      rev: 2,
      actor: "alice",
    });
    await Promise.resolve();
    expect(getMock).not.toHaveBeenCalled(); // deferred — do not stomp the edit

    resolvePut({
      id: "r-1",
      order: 0,
      cells: { "c-1": "hello" },
      created_at: "x",
      updated_at: "y",
    });
    await commit;
    await Promise.resolve();
    await Promise.resolve();

    expect(getMock).toHaveBeenCalled(); // ran once the write landed
    expect(store.rev).toBe(2);
  });
});

describe("useListiesStore — membership & lifecycle events", () => {
  it("updates members on members.changed", async () => {
    asUser("bob");
    getMock.mockResolvedValue(view());
    const store = useListiesStore();
    await store.fetchSheet("s-1");

    captured.handlers!.onMembersChanged!({
      type: "members.changed",
      sheet_id: "s-1",
      members: ["alice", "bob", "carol"],
    });

    expect(store.members).toEqual(["alice", "bob", "carol"]);
  });

  it("closes when I am the removed member", async () => {
    asUser("bob");
    getMock.mockResolvedValue(view());
    const store = useListiesStore();
    await store.fetchSheet("s-1");

    captured.handlers!.onClosed!({
      type: "sheet.closed",
      sheet_id: "s-1",
      reason: "removed",
      member: "bob",
    });

    expect(store.closedReason).toBe("removed");
    expect(closeMock).toHaveBeenCalled();
  });

  it("ignores a removal that targets someone else", async () => {
    asUser("bob");
    getMock.mockResolvedValue(view());
    const store = useListiesStore();
    await store.fetchSheet("s-1");

    captured.handlers!.onClosed!({
      type: "sheet.closed",
      sheet_id: "s-1",
      reason: "removed",
      member: "carol",
    });

    expect(store.closedReason).toBeNull();
  });

  it("spares the owner on unshared but closes a member", async () => {
    // Owner viewing their own shared sheet.
    asUser("alice");
    getMock.mockResolvedValue(view({ can_manage: true }));
    const owner = useListiesStore();
    await owner.fetchSheet("s-1");
    captured.handlers!.onClosed!({
      type: "sheet.closed",
      sheet_id: "s-1",
      reason: "unshared",
    });
    expect(owner.closedReason).toBeNull(); // owner stays

    // A member gets closed by the same reason.
    setActivePinia(createPinia());
    asUser("bob");
    getMock.mockResolvedValue(view());
    const member = useListiesStore();
    await member.fetchSheet("s-1");
    captured.handlers!.onClosed!({
      type: "sheet.closed",
      sheet_id: "s-1",
      reason: "unshared",
    });
    expect(member.closedReason).toBe("unshared");
  });

  it("closes everyone on deleted", async () => {
    asUser("alice");
    getMock.mockResolvedValue(view({ can_manage: true }));
    const store = useListiesStore();
    await store.fetchSheet("s-1");

    captured.handlers!.onClosed!({
      type: "sheet.closed",
      sheet_id: "s-1",
      reason: "deleted",
    });

    expect(store.closedReason).toBe("deleted");
  });
});
