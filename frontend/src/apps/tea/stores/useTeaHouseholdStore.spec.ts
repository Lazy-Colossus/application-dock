import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, delMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  delMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, del: delMock, put: vi.fn() },
}));

import { useTeaHouseholdStore } from "./useTeaHouseholdStore";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Cabinet } from "../types";

const SHARED: Cabinet = { id: "c_1", owner: "jakub", members: ["jakub", "mia"], is_owner: true };

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  useAuthStore().username = "jakub";
});

describe("useTeaHouseholdStore", () => {
  it("fetches the cabinet and knows it is shared, naming the others", async () => {
    getMock.mockResolvedValue(SHARED);
    const store = useTeaHouseholdStore();
    await store.fetchCabinet();
    expect(getMock).toHaveBeenCalledWith("/tea/cabinet");
    expect(store.shared).toBe(true);
    expect(store.others).toEqual(["mia"]);
    expect(store.loading).toBe(false);
  });

  it("is not shared with only one member", async () => {
    getMock.mockResolvedValue({ id: null, owner: "jakub", members: ["jakub"], is_owner: true });
    const store = useTeaHouseholdStore();
    await store.fetchCabinet();
    expect(store.shared).toBe(false);
    expect(store.others).toEqual([]);
  });

  it("adds a member and takes the returned cabinet", async () => {
    postMock.mockResolvedValue(SHARED);
    const store = useTeaHouseholdStore();
    expect(await store.addMember("mia")).toBe(true);
    expect(postMock).toHaveBeenCalledWith("/tea/cabinet/members", { username: "mia" });
    expect(store.cabinet).toEqual(SHARED);
  });

  it("shows the server's reason when an add is refused", async () => {
    postMock.mockRejectedValue(
      Object.assign(new Error("422"), { detail: "mia already has teas in their cabinet" }),
    );
    const store = useTeaHouseholdStore();
    expect(await store.addMember("mia")).toBe(false);
    expect(store.error).toBe("mia already has teas in their cabinet");
    expect(store.loading).toBe(false);
  });

  it("leaves with my own name and then reloads every tea store", async () => {
    delMock.mockResolvedValue({ id: null, owner: "jakub", members: ["jakub"], is_owner: true });
    getMock.mockResolvedValue([]);
    const store = useTeaHouseholdStore();
    expect(await store.leave()).toBe(true);
    expect(delMock).toHaveBeenCalledWith("/tea/cabinet/members/jakub");
    const paths = getMock.mock.calls.map((call) => call[0]);
    expect(paths).toEqual(
      expect.arrayContaining(["/tea/teas", "/tea/catalogue", "/tea/sessions?status=in_progress"]),
    );
  });

  it("reads the dock roster, and yields nothing if it fails", async () => {
    getMock.mockResolvedValueOnce({ usernames: ["jakub", "mia"] });
    const store = useTeaHouseholdStore();
    expect(await store.fetchRoster()).toEqual(["jakub", "mia"]);
    getMock.mockRejectedValueOnce(new Error("down"));
    expect(await store.fetchRoster()).toEqual([]);
  });
});
