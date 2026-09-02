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

import { useKdhStore } from "./useKdhStore";
import type { Calendar } from "@/apps/kdh/types";

const CREATED: Calendar = {
  schema_version: 1,
  id: "cal-ab12cd34",
  name: "DnD",
  created_at: "2026-09-03T10:00:00Z",
  created_by: "jake",
  updated_at: "2026-09-03T10:00:00Z",
  invitees: [
    { id: "inv-1", name: "Dani", color: "#e8643a", order: 0, removed_at: null },
    { id: "inv-2", name: "Jake", color: "#3a86e8", order: 1, removed_at: null },
  ],
  votes: {},
  chosen_dates: [],
};

describe("useKdhStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("loads who I am", async () => {
    getMock.mockResolvedValueOnce({ username: "jake", is_admin: true });
    const store = useKdhStore();
    await store.fetchMe();

    expect(getMock).toHaveBeenCalledWith("/kdh/me");
    expect(store.me).toEqual({ username: "jake", is_admin: true });
    expect(store.loading).toBe(false);
  });

  it("loads the calendar list", async () => {
    getMock.mockResolvedValueOnce([
      {
        id: "cal-1",
        name: "DnD",
        invitee_count: 3,
        invitee_names: ["Dani", "Jake", "Tom"],
        created_at: "x",
      },
    ]);
    const store = useKdhStore();
    await store.fetchCalendars();

    expect(store.calendars).toHaveLength(1);
    expect(store.error).toBeNull();
  });

  it("routes a failed load into error and clears loading", async () => {
    getMock.mockRejectedValueOnce(new Error("boom"));
    const store = useKdhStore();
    await store.fetchCalendars();

    expect(store.error).toBe("boom");
    expect(store.loading).toBe(false);
  });

  it("puts a created calendar at the top of the list", async () => {
    postMock.mockResolvedValueOnce(CREATED);
    const store = useKdhStore();
    store.calendars = [
      {
        id: "cal-old",
        name: "Old",
        invitee_count: 1,
        invitee_names: ["Kit"],
        created_at: "a",
      },
    ];

    const created = await store.createCalendar("DnD", ["Dani", "Jake"]);

    expect(postMock).toHaveBeenCalledWith("/kdh/calendars", {
      name: "DnD",
      invitee_names: ["Dani", "Jake"],
    });
    expect(created.id).toBe("cal-ab12cd34");
    expect(store.calendars.map((c) => c.id)).toEqual([
      "cal-ab12cd34",
      "cal-old",
    ]);
    expect(store.calendars[0]?.invitee_count).toBe(2);
  });

  it("rethrows a failed create so the caller does not navigate", async () => {
    postMock.mockRejectedValueOnce(new Error("nope"));
    const store = useKdhStore();

    await expect(store.createCalendar("DnD", ["Dani"])).rejects.toThrow("nope");
    expect(store.error).toBe("nope");
    expect(store.loading).toBe(false);
    expect(store.calendars).toEqual([]);
  });

  it("loads one calendar", async () => {
    getMock.mockResolvedValueOnce(CREATED);
    const store = useKdhStore();
    await store.fetchCalendar("cal-ab12cd34");

    expect(getMock).toHaveBeenCalledWith("/kdh/calendars/cal-ab12cd34");
    expect(store.currentCalendar?.name).toBe("DnD");
  });

  it("leaves currentCalendar null and sets error when the calendar is gone", async () => {
    getMock.mockRejectedValueOnce(new Error("Calendar not found"));
    const store = useKdhStore();
    await store.fetchCalendar("cal-gone");

    expect(store.currentCalendar).toBeNull();
    expect(store.error).toBe("Calendar not found");
    expect(store.loading).toBe(false);
  });

  it("a rename updates the cached summary too, so the list is not stale", async () => {
    putMock.mockResolvedValueOnce({ ...CREATED, name: "Strahd" });
    const store = useKdhStore();
    store.currentCalendar = CREATED;
    store.calendars = [
      {
        id: "cal-ab12cd34",
        name: "DnD",
        invitee_count: 2,
        invitee_names: ["Dani", "Jake"],
        created_at: "x",
      },
    ];

    await store.renameCalendar("cal-ab12cd34", "Strahd");

    expect(store.currentCalendar?.name).toBe("Strahd");
    expect(store.calendars[0]?.name).toBe("Strahd");
  });

  it("rethrows a failed rename and leaves the name alone", async () => {
    putMock.mockRejectedValueOnce(new Error("nope"));
    const store = useKdhStore();
    store.calendars = [
      {
        id: "cal-ab12cd34",
        name: "DnD",
        invitee_count: 2,
        invitee_names: ["Dani", "Jake"],
        created_at: "x",
      },
    ];

    await expect(
      store.renameCalendar("cal-ab12cd34", "Strahd"),
    ).rejects.toThrow();
    expect(store.calendars[0]?.name).toBe("DnD");
    expect(store.error).toBe("nope");
  });

  it("a delete drops the calendar from the list and clears the current one", async () => {
    delMock.mockResolvedValueOnce(undefined);
    const store = useKdhStore();
    store.currentCalendar = CREATED;
    store.calendars = [
      {
        id: "cal-ab12cd34",
        name: "DnD",
        invitee_count: 2,
        invitee_names: ["Dani", "Jake"],
        created_at: "x",
      },
      {
        id: "cal-other",
        name: "Keep",
        invitee_count: 1,
        invitee_names: ["Kit"],
        created_at: "y",
      },
    ];

    await store.deleteCalendar("cal-ab12cd34");

    expect(store.calendars.map((c) => c.id)).toEqual(["cal-other"]);
    expect(store.currentCalendar).toBeNull();
  });

  it("rethrows a failed delete and keeps the calendar in the list", async () => {
    delMock.mockRejectedValueOnce(new Error("403: forbidden"));
    const store = useKdhStore();
    store.calendars = [
      {
        id: "cal-ab12cd34",
        name: "DnD",
        invitee_count: 2,
        invitee_names: ["Dani", "Jake"],
        created_at: "x",
      },
    ];

    await expect(store.deleteCalendar("cal-ab12cd34")).rejects.toThrow();
    expect(store.calendars).toHaveLength(1);
    expect(store.error).toContain("forbidden");
  });
});
