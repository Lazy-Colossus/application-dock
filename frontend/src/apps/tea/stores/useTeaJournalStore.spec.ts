import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, putMock, delMock, uploadMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
  uploadMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, put: putMock, del: delMock, upload: uploadMock, post: vi.fn() },
}));

import { useTeaJournalStore } from "./useTeaJournalStore";
import type { JournalEntry, TeaSessionWrite } from "../types";

function entry(id: string, overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id,
    tea_id: "t-1",
    away_tea_name: "",
    away_class_id: null,
    status: "finalised",
    started_at: "2026-09-28T18:00:00Z",
    leaf_grams: 5,
    water_temp_c: null,
    rating: null,
    curve_source: "generic",
    curve_source_label: "",
    infusions: [],
    teaware_id: null,
    timed: true,
    cha_xi: null,
    brewed_by: "jakub",
    vessel_volume_ml: null,
    updated_at: "2026-09-28T18:30:00Z",
    finished_at: "2026-09-28T18:30:00Z",
    image_url: null,
    tea_name: "Tieguanyin",
    class_id: "oolong",
    tea_image_url: null,
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  for (const mock of [getMock, putMock, delMock, uploadMock]) mock.mockReset();
});

describe("useTeaJournalStore", () => {
  it("fetches the journal", async () => {
    getMock.mockResolvedValue([entry("s-1")]);
    const store = useTeaJournalStore();
    await store.fetchJournal();
    expect(getMock).toHaveBeenCalledWith("/tea/journal");
    expect(store.byId("s-1")?.tea_name).toBe("Tieguanyin");
    expect(store.loading).toBe(false);
  });

  it("creates a journal-only entry, then reloads the wall", async () => {
    putMock.mockResolvedValue({});
    getMock.mockResolvedValue([entry("s-2", { timed: false })]);
    const store = useTeaJournalStore();
    const ok = await store.create("s-2", { timed: false } as TeaSessionWrite);
    expect(ok).toBe(true);
    expect(putMock.mock.calls[0][0]).toBe("/tea/sessions/s-2");
    expect(store.entries.map((e) => e.id)).toEqual(["s-2"]);
  });

  it("replaces an edited entry in place", async () => {
    getMock.mockResolvedValue([entry("s-1")]);
    putMock.mockResolvedValue(entry("s-1", { rating: 5 }));
    const store = useTeaJournalStore();
    await store.fetchJournal();
    await store.edit("s-1", {
      cha_xi: null,
      rating: 5,
      leaf_grams: 5,
      water_temp_c: null,
      teaware_id: null,
    });
    expect(putMock.mock.calls[0][0]).toBe("/tea/sessions/s-1/journal");
    expect(store.byId("s-1")?.rating).toBe(5);
  });

  it("removes a deleted entry", async () => {
    getMock.mockResolvedValue([entry("s-1")]);
    delMock.mockResolvedValue(undefined);
    const store = useTeaJournalStore();
    await store.fetchJournal();
    expect(await store.remove("s-1")).toBe(true);
    expect(delMock).toHaveBeenCalledWith("/tea/sessions/s-1/journal");
    expect(store.entries).toEqual([]);
  });

  it("patches the photo onto its entry", async () => {
    getMock.mockResolvedValue([entry("s-1")]);
    uploadMock.mockResolvedValue({ image_url: "/api/tea/sessions/s-1/image" });
    const store = useTeaJournalStore();
    await store.fetchJournal();
    await store.uploadPhoto("s-1", new File(["x"], "t.jpg", { type: "image/jpeg" }));
    expect(store.byId("s-1")?.image_url).toBe("/api/tea/sessions/s-1/image");
  });

  it("routes a failure into error", async () => {
    delMock.mockRejectedValue(Object.assign(new Error("x"), { detail: "Forbidden" }));
    const store = useTeaJournalStore();
    expect(await store.remove("s-1")).toBe(false);
    expect(store.error).toBe("Forbidden");
    expect(store.saving).toBe(false);
  });
});
