import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, delMock } = vi.hoisted(() => ({ getMock: vi.fn(), delMock: vi.fn() }));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, del: delMock, put: vi.fn(), post: vi.fn() },
}));

import { useTeaSessionsStore } from "./useTeaSessionsStore";
import type { TeaSession } from "../types";

function session(id: string, overrides: Partial<TeaSession> = {}): TeaSession {
  return {
    id,
    brewed_by: "jakub",
    tea_id: "t-1",
    status: "in_progress",
    started_at: "2026-09-25T19:40:00Z",
    updated_at: "2026-09-25T19:55:00Z",
    finished_at: null,
    leaf_grams: 6,
    water_temp_c: 95,
    rating: null,
    curve_source: "almanac",
    curve_source_label: "almanac: Tieguanyin",
    infusions: [],
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset();
  delMock.mockReset();
});

describe("useTeaSessionsStore", () => {
  it("fetches in-progress sessions", async () => {
    getMock.mockResolvedValue([session("s-1")]);
    const store = useTeaSessionsStore();
    await store.fetchInProgress();
    expect(getMock).toHaveBeenCalledWith("/tea/sessions?status=in_progress");
    expect(store.inProgress.map((s) => s.id)).toEqual(["s-1"]);
    expect(store.loading).toBe(false);
  });

  it("fetches a tea's finished sessions", async () => {
    getMock.mockResolvedValue([session("s-2", { status: "finalised" })]);
    const store = useTeaSessionsStore();
    await store.fetchForTea("t-1");
    expect(getMock).toHaveBeenCalledWith("/tea/teas/t-1/sessions");
    expect(store.byTea["t-1"].map((s) => s.id)).toEqual(["s-2"]);
  });

  it("routes a failure into error", async () => {
    getMock.mockRejectedValue(Object.assign(new Error("x"), { detail: "Server down" }));
    const store = useTeaSessionsStore();
    await store.fetchInProgress();
    expect(store.error).toBe("Server down");
    expect(store.loading).toBe(false);
  });

  it("discards on the server and forgets locally, treating 404 as done", async () => {
    getMock.mockResolvedValue([session("s-1"), session("s-2")]);
    delMock.mockRejectedValueOnce(Object.assign(new Error("404"), { status: 404 }));
    const store = useTeaSessionsStore();
    await store.fetchInProgress();
    await store.discard("s-1");
    expect(delMock).toHaveBeenCalledWith("/tea/sessions/s-1");
    expect(store.inProgress.map((s) => s.id)).toEqual(["s-2"]);
    expect(store.error).toBeNull();
  });
});
