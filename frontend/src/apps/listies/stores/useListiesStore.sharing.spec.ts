import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, delMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  delMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: vi.fn(), del: delMock },
}));
const { closeMock } = vi.hoisted(() => ({ closeMock: vi.fn() }));
vi.mock("@/apps/listies/composables/useSheetEvents", () => ({
  useSheetEvents: vi.fn(() => ({ close: closeMock })),
}));

import { useListiesStore } from "./useListiesStore";
import { useAuthStore } from "@/stores/useAuthStore";
import type { SheetSummary, SheetView } from "@/apps/listies/types";

const privateView = (): SheetView => ({
  id: "s-1",
  name: "Trip",
  created_at: "t",
  shared: false,
  tabs: [{ id: "tb-1", name: "One", order: 0, columns: [], rows: [] }],
});

const sharedView = (over: Partial<SheetView> = {}): SheetView => ({
  ...privateView(),
  shared: true,
  owner: "alice",
  members: ["alice", "bob"],
  rev: 0,
  can_manage: true,
  ...over,
});

const summary = (): SheetSummary => ({
  id: "s-1",
  name: "Trip",
  tab_count: 1,
  row_count: 0,
  created_at: "t",
  shared: false,
  owner: null,
});

async function openPrivate() {
  const auth = useAuthStore();
  auth.token = "jwt";
  auth.username = "alice";
  getMock.mockResolvedValue(privateView());
  const store = useListiesStore();
  store.sheets = [summary()];
  await store.fetchSheet("s-1");
  return store;
}

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset();
  postMock.mockReset();
  delMock.mockReset();
  closeMock.mockClear();
});

describe("useListiesStore — fetchUsers", () => {
  it("returns the platform roster", async () => {
    getMock.mockResolvedValue({ usernames: ["alice", "bob"] });
    const store = useListiesStore();
    expect(await store.fetchUsers()).toEqual(["alice", "bob"]);
    expect(getMock).toHaveBeenCalledWith("/auth/users");
  });

  it("routes a failure into error and returns []", async () => {
    getMock.mockRejectedValue(new Error("boom"));
    const store = useListiesStore();
    expect(await store.fetchUsers()).toEqual([]);
    expect(store.error).toBe("boom");
  });
});

describe("useListiesStore — shareSheet", () => {
  it("promotes the open sheet and reflects the shared state and summary", async () => {
    const store = await openPrivate();
    postMock.mockResolvedValue(sharedView());

    await store.shareSheet(["bob"]);

    expect(postMock).toHaveBeenCalledWith("/listies/sheets/s-1/share", {
      usernames: ["bob"],
    });
    expect(store.shared).toBe(true);
    expect(store.owner).toBe("alice");
    expect(store.members).toEqual(["alice", "bob"]);
    expect(store.canManage).toBe(true);
    expect(store.sheets[0]!.shared).toBe(true);
    expect(store.sheets[0]!.owner).toBe("alice");
  });

  it("routes a failure into error and leaves state unchanged", async () => {
    const store = await openPrivate();
    postMock.mockRejectedValue(new Error("403: only the owner"));

    await store.shareSheet(["bob"]);

    expect(store.error).toBe("403: only the owner");
    expect(store.shared).toBe(false);
  });
});

describe("useListiesStore — removeMember", () => {
  it("updates the member list from the response", async () => {
    const auth = useAuthStore();
    auth.token = "jwt";
    auth.username = "alice";
    getMock.mockResolvedValue(sharedView());
    const store = useListiesStore();
    await store.fetchSheet("s-1");

    delMock.mockResolvedValue(sharedView({ members: ["alice"] }));
    await store.removeMember("bob");

    expect(delMock).toHaveBeenCalledWith("/listies/sheets/s-1/share/bob");
    expect(store.members).toEqual(["alice"]);
  });
});

describe("useListiesStore — stopSharing", () => {
  it("demotes the sheet to private and tears down the subscription", async () => {
    const auth = useAuthStore();
    auth.token = "jwt";
    auth.username = "alice";
    getMock.mockResolvedValue(sharedView());
    const store = useListiesStore();
    store.sheets = [{ ...summary(), shared: true, owner: "alice" }];
    await store.fetchSheet("s-1");
    closeMock.mockClear();

    delMock.mockResolvedValue(privateView());
    await store.stopSharing();

    expect(delMock).toHaveBeenCalledWith("/listies/sheets/s-1/share");
    expect(store.shared).toBe(false);
    expect(store.sheets[0]!.shared).toBe(false);
    expect(closeMock).toHaveBeenCalled(); // live channel closed
  });
});
