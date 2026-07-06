import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));

import { useHotaruUserStore } from "./useHotaruUserStore";

const USERS = [
  { id: "dani", name: "Dani" },
  { id: "jake", name: "Jake" },
];

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  getMock.mockReset();
});

describe("useHotaruUserStore", () => {
  it("loads users via the API", async () => {
    getMock.mockResolvedValueOnce(USERS);
    const store = useHotaruUserStore();
    await store.loadUsers();
    expect(getMock).toHaveBeenCalledWith("/hotaru/users");
    expect(store.users).toEqual(USERS);
    expect(store.error).toBeNull();
  });

  it("sets the active user and resolves activeUser", async () => {
    getMock.mockResolvedValueOnce(USERS);
    const store = useHotaruUserStore();
    await store.loadUsers();
    store.setActiveUser("jake");
    expect(store.activeUserId).toBe("jake");
    expect(store.activeUser).toEqual({ id: "jake", name: "Jake" });
  });

  it("persists the active user to localStorage and rehydrates", async () => {
    getMock.mockResolvedValue(USERS);
    const first = useHotaruUserStore();
    first.setActiveUser("dani");
    expect(localStorage.getItem("hotaru.activeUser")).toBe("dani");

    // A fresh pinia + store instance reads the persisted id on creation.
    setActivePinia(createPinia());
    const second = useHotaruUserStore();
    expect(second.activeUserId).toBe("dani");
  });

  it("drops a persisted id that is not a known user after loading", async () => {
    localStorage.setItem("hotaru.activeUser", "ghost");
    getMock.mockResolvedValueOnce(USERS);
    const store = useHotaruUserStore();
    expect(store.activeUserId).toBe("ghost");
    await store.loadUsers();
    expect(store.activeUserId).toBeNull();
  });

  it("routes API failures into error", async () => {
    getMock.mockRejectedValueOnce(new Error("boom"));
    const store = useHotaruUserStore();
    await store.loadUsers();
    expect(store.error).toBe("boom");
    expect(store.loading).toBe(false);
  });
});
