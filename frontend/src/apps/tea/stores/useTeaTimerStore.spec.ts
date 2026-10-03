import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, putMock, delMock, uploadMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
  uploadMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, put: putMock, del: delMock, post: vi.fn(), upload: uploadMock },
}));

import { useTeaTimerStore } from "./useTeaTimerStore";
import { emptyTasting } from "../tasting";
import type { BrewingCurve, Tasting, Tea, TeaSession, Teaware } from "../types";

function tea(overrides: Partial<Tea> = {}): Tea {
  return {
    id: "t-1",
    name: "Tieguanyin",
    catalogue_node_id: "oolong.anxi.tieguanyin",
    class_id: "oolong",
    form: null,
    origin: "",
    vendor: "",
    year: null,
    harvest_season: null,
    cultivar: "",
    grams_purchased: null,
    grams_remaining: 42,
    price_paid: null,
    purchase_date: null,
    storage_location: "",
    low_threshold_grams: null,
    notes: "",
    image_url: null,
    brewing: null,
    created_at: "2026-09-25T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
    ...overrides,
  };
}

const ALMANAC: BrewingCurve = {
  leaf_grams: 6,
  water_temp_c: 95,
  steep_seconds: [20, 25, 30, 40],
  source: "almanac",
  source_label: "almanac: Tieguanyin",
};

function httpError(status: number): Error {
  return Object.assign(new Error(`${status}`), { status, detail: `HTTP ${status}` });
}

const POT: Teaware = {
  id: "w-1",
  name: "Zhuni",
  type: "pot",
  material: "clay",
  volume_ml: 110,
  porous: false,
  dedicated_node_id: null,
  maker: "",
  origin: "",
  acquired_date: null,
  price_paid: null,
  notes: "",
  image_url: null,
  retired_at: null,
  created_at: "2026-09-27T10:00:00Z",
  updated_at: "2026-09-27T10:00:00Z",
};

function mockCurve(curve: unknown): void {
  getMock.mockImplementation((path: string) =>
    Promise.resolve(path.startsWith("/tea/teaware/last-used") ? null : curve),
  );
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  getMock.mockReset();
  putMock.mockReset().mockImplementation((_path: string, body: unknown) => Promise.resolve(body));
  delMock.mockReset().mockResolvedValue(undefined);
  uploadMock.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-26T18:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

async function steep(store: ReturnType<typeof useTeaTimerStore>, seconds: number) {
  store.start();
  vi.setSystemTime(Date.now() + seconds * 1000);
  await store.stop();
}

describe("plain timer", () => {
  it("starts on the generic curve and never touches the server", async () => {
    const store = useTeaTimerStore();
    await steep(store, 11);
    expect(store.brewed.map((i) => i.actual_seconds)).toEqual([11]);
    expect(store.current).toEqual({ number: 2, target_seconds: 15, actual_seconds: null });
    expect(store.live?.curve.source).toBe("generic");
    expect(putMock).not.toHaveBeenCalled();
  });

  it("nudges only the upcoming target, never below 1s", () => {
    const store = useTeaTimerStore();
    store.nudge(5);
    expect(store.current?.target_seconds).toBe(15);
    store.nudge(-100);
    expect(store.current?.target_seconds).toBe(1);
  });

  it("redo clears the last steep and drops the pending one", async () => {
    const store = useTeaTimerStore();
    await steep(store, 11);
    await steep(store, 16);
    await store.redoLast();
    expect(store.live?.infusions).toEqual([
      { number: 1, target_seconds: 10, actual_seconds: 11 },
      { number: 2, target_seconds: 15, actual_seconds: null },
    ]);
  });

  it("rewrites a brewed steep's time, leaving the pending one alone", async () => {
    const store = useTeaTimerStore();
    await steep(store, 11);
    await steep(store, 95);
    await store.setSteepSeconds(2, 30);
    await store.setSteepSeconds(3, 40);
    expect(store.live?.infusions.map((i) => i.actual_seconds)).toEqual([11, 30, null]);
  });

  it("end clears everything", async () => {
    const store = useTeaTimerStore();
    await steep(store, 11);
    store.end();
    expect(store.live).toBeNull();
    expect(localStorage.getItem("tea-timer:live")).toBeNull();
  });
});

describe("attaching a tea", () => {
  it("re-targets unbrewed steeps only, prefills grams and pushes", async () => {
    mockCurve(ALMANAC);
    const store = useTeaTimerStore();
    await steep(store, 11);
    await store.attachTea(tea());

    expect(getMock).toHaveBeenCalledWith("/tea/teas/t-1/curve");
    expect(store.live?.infusions).toEqual([
      { number: 1, target_seconds: 10, actual_seconds: 11 },
      { number: 2, target_seconds: 25, actual_seconds: null },
    ]);
    expect(store.live?.leafGrams).toBe(6);
    expect(store.liquor).toBe("#d49a3f");
    const [path, body] = putMock.mock.calls[0];
    expect(path).toBe(`/tea/sessions/${store.live?.sessionId}`);
    expect(body).toMatchObject({ tea_id: "t-1", status: "in_progress", curve_source: "almanac" });
    expect(store.live?.pushed).toBe(true);
  });

  it("keeps a running steep running while it re-targets", async () => {
    mockCurve(ALMANAC);
    const store = useTeaTimerStore();
    store.start();
    await store.attachTea(tea());
    expect(store.running).toBe(true);
    expect(store.current?.target_seconds).toBe(20);
  });

  it("falls back to generic with a label when the curve cannot load", async () => {
    getMock.mockRejectedValue(httpError(0));
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    expect(store.live?.curve.source).toBe("generic");
    expect(store.live?.curve.source_label).toBe("generic gongfu (couldn't load tea curve)");
  });

  it("syncs a rewritten steep time", async () => {
    mockCurve(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    await steep(store, 90);
    await store.setSteepSeconds(1, 25);
    expect(putMock.mock.calls.at(-1)![1]).toMatchObject({
      infusions: [
        { number: 1, actual_seconds: 25 },
        { number: 2, actual_seconds: null },
      ],
    });
  });

  it("pushes after every steep once a tea is attached", async () => {
    mockCurve(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    await steep(store, 21);
    expect(putMock).toHaveBeenCalledTimes(2);
  });

  it("prefills the vessel you last used for this tea and sends it", async () => {
    getMock.mockImplementation((path: string) =>
      Promise.resolve(path === "/tea/teaware/last-used?tea_id=t-1" ? POT : ALMANAC),
    );
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    expect(store.live?.teaware).toEqual({ id: "w-1", name: "Zhuni", volume_ml: 110 });
    expect(putMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/^\/tea\/sessions\//),
      expect.objectContaining({ teaware_id: "w-1" }),
    );
  });

  it("keeps a vessel you picked yourself over the prefill", async () => {
    getMock.mockImplementation((path: string) =>
      Promise.resolve(path.startsWith("/tea/teaware/last-used") ? POT : ALMANAC),
    );
    const store = useTeaTimerStore();
    await store.setVessel({ ...POT, id: "w-2", name: "Gaiwan" });
    await store.attachTea(tea());
    expect(store.live?.teaware?.id).toBe("w-2");
  });

  it("does not prefill after explicitly picking No vessel", async () => {
    getMock.mockImplementation((path: string) =>
      Promise.resolve(path.startsWith("/tea/teaware/last-used") ? POT : ALMANAC),
    );
    const store = useTeaTimerStore();
    await store.setVessel(null);
    await store.attachTea(tea());
    expect(store.live?.teaware).toBeNull();
  });

  it("does not let a slow prefill for one tea land on a session already switched to another", async () => {
    let resolveLastUsedX!: (value: unknown) => void;
    getMock.mockImplementation((path: string) => {
      if (path === "/tea/teaware/last-used?tea_id=t-1")
        return new Promise((resolve) => (resolveLastUsedX = resolve));
      if (path.startsWith("/tea/teaware/last-used")) return Promise.resolve(null);
      return Promise.resolve(ALMANAC);
    });
    const store = useTeaTimerStore();
    const attachingX = store.attachTea(tea());
    await Promise.resolve();
    await Promise.resolve();
    await store.attachTea(tea({ id: "t-2", name: "Dragonwell" }));
    resolveLastUsedX(POT);
    await attachingX;
    expect(store.live?.tea?.id).toBe("t-2");
    expect(store.live?.teaware ?? null).toBeNull();
  });
});

describe("water temp", () => {
  it("accepts only an integer 1-100, otherwise stores null", () => {
    const store = useTeaTimerStore();
    store.start();
    store.setWaterTemp(95);
    expect(store.live?.waterTempC).toBe(95);
    store.setWaterTemp(0);
    expect(store.live?.waterTempC).toBeNull();
    store.setWaterTemp(95);
    store.setWaterTemp(950);
    expect(store.live?.waterTempC).toBeNull();
    store.setWaterTemp(95);
    store.setWaterTemp(95.5);
    expect(store.live?.waterTempC).toBeNull();
    store.setWaterTemp(95);
    store.setWaterTemp(null);
    expect(store.live?.waterTempC).toBeNull();
  });
});

describe("sync failures", () => {
  it("marks unsynced on a failed push and clears it on the next success", async () => {
    mockCurve(ALMANAC);
    const store = useTeaTimerStore();
    putMock.mockRejectedValueOnce(httpError(0));
    await store.attachTea(tea());
    expect(store.unsynced).toBe(true);
    await steep(store, 21);
    expect(store.unsynced).toBe(false);
  });

  it("detaches the tea when the server says it is gone", async () => {
    mockCurve(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    putMock.mockRejectedValueOnce(httpError(404));
    await steep(store, 21);
    expect(store.live?.tea).toBeNull();
    expect(store.brewed.map((i) => i.actual_seconds)).toEqual([21]);
    expect(store.notice).toContain("Tieguanyin");
    expect(store.unsynced).toBe(false);
  });

  it("ignores a stale push result after the session has already ended", async () => {
    mockCurve(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());

    let rejectPut!: (reason: unknown) => void;
    putMock.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectPut = reject;
        }),
    );
    const pushing = store.push();
    store.end();
    rejectPut(httpError(404));
    await pushing;

    expect(store.unsynced).toBe(false);
    expect(store.notice).toBeNull();
  });

  it("drops a vessel the server refuses and keeps syncing", async () => {
    mockCurve(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    putMock.mockRejectedValueOnce(Object.assign(httpError(422), { detail: "Zhuni is retired" }));
    await store.setVessel(POT);
    expect(store.live?.teaware).toBeNull();
    expect(store.notice).toContain("Zhuni");
    expect(store.unsynced).toBe(false);
    expect(putMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ teaware_id: null }),
    );
  });

  it("marks unsynced on a 422 that isn't about a vessel that was ever sent", async () => {
    mockCurve(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    putMock.mockRejectedValueOnce(httpError(422));
    await steep(store, 21);
    expect(store.unsynced).toBe(true);
  });

  it("keeps a newly picked vessel when an older push's 422 catches up for the vessel it replaced", async () => {
    mockCurve(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());

    let rejectFirstPut!: (reason: unknown) => void;
    putMock.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectFirstPut = reject;
        }),
    );
    const settingA = store.setVessel(POT);
    await store.setVessel({ ...POT, id: "w-2", name: "Gaiwan" });
    rejectFirstPut(httpError(422));
    await settingA;

    expect(store.live?.teaware?.id).toBe("w-2");
    expect(store.notice ?? "").not.toContain("Zhuni");
    expect(store.notice ?? "").not.toContain("Gaiwan");
    expect(putMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ teaware_id: "w-2" }),
    );
  });
});

describe("finishing", () => {
  it("finalises with the rating, clears, and returns the tea id", async () => {
    mockCurve(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    await steep(store, 21);
    const teaId = await store.finish(5);
    expect(teaId).toBe("t-1");
    expect(putMock.mock.calls.at(-1)![1]).toMatchObject({
      status: "finalised",
      rating: 5,
      leaf_grams: 6,
    });
    expect(store.live).toBeNull();
  });

  it("treats a 409 as already finished", async () => {
    mockCurve(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    putMock.mockRejectedValueOnce(httpError(409));
    expect(await store.finish(null)).toBe("t-1");
    expect(store.live).toBeNull();
  });

  it("detaches the tea on a 404 and carries on as a plain timer", async () => {
    mockCurve(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    putMock.mockRejectedValueOnce(httpError(404));
    expect(await store.finish(4)).toBeNull();
    expect(store.live).not.toBeNull();
    expect(store.live?.tea).toBeNull();
    expect(store.notice).toContain("Tieguanyin");
    expect(store.error).toBeNull();
  });

  it("keeps the session and reports the error when finishing fails", async () => {
    mockCurve(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    putMock.mockRejectedValueOnce(httpError(500));
    expect(await store.finish(4)).toBeNull();
    expect(store.live).not.toBeNull();
    expect(store.error).toBe("HTTP 500");
    expect(store.loading).toBe(false);
  });

  it("finishing with a refused vessel drops it and keeps the sheet open", async () => {
    mockCurve(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    await store.setVessel(POT);
    putMock.mockRejectedValueOnce(httpError(422));
    expect(await store.finish(4)).toBeNull();
    expect(store.live?.teaware).toBeNull();
    expect(store.live?.tea).not.toBeNull();
    expect(store.error).toBeNull();
    expect(store.notice).toBe("Zhuni can't be brewed in any more — tap Save again to finish without it.");
  });
});

describe("discard", () => {
  it("deletes a pushed session on the server", async () => {
    mockCurve(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    const id = store.live!.sessionId;
    expect(await store.discard()).toBe(true);
    expect(delMock).toHaveBeenCalledWith(`/tea/sessions/${id}`);
    expect(store.live).toBeNull();
  });

  it("clears a never-pushed session without a request", async () => {
    const store = useTeaTimerStore();
    store.start();
    expect(await store.discard()).toBe(true);
    expect(delMock).not.toHaveBeenCalled();
  });

  it("deletes on the server even while the first push is still pending", async () => {
    mockCurve(ALMANAC);
    let resolvePut!: (value: unknown) => void;
    putMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePut = resolve;
        }),
    );
    const store = useTeaTimerStore();
    const attaching = store.attachTea(tea());
    // attachTea now awaits the curve fetch and the vessel prefill fetch before
    // pushing: enough microtask ticks to get past both, short of the pending put.
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    const id = store.live?.sessionId;

    expect(await store.discard()).toBe(true);
    expect(delMock).toHaveBeenCalledWith(`/tea/sessions/${id}`);
    expect(store.live).toBeNull();

    resolvePut({});
    await attaching;
  });
});

describe("persistence", () => {
  it("hydrates a running steep and records the whole elapsed time", async () => {
    const first = useTeaTimerStore();
    first.start();

    // Reload 45 seconds later.
    vi.setSystemTime(Date.now() + 45_000);
    setActivePinia(createPinia());
    const reloaded = useTeaTimerStore();
    expect(reloaded.running).toBe(true);
    await reloaded.stop();
    expect(reloaded.brewed[0].actual_seconds).toBe(45);
  });

  it("drops an invalid saved session", () => {
    localStorage.setItem("tea-timer:live", '{"version":1,"infusions":"nope"}');
    const store = useTeaTimerStore();
    expect(store.live).toBeNull();
    expect(localStorage.getItem("tea-timer:live")).toBeNull();
  });

  it("remembers the chime toggle", () => {
    const store = useTeaTimerStore();
    expect(store.chimeOn).toBe(true);
    store.toggleChime();
    setActivePinia(createPinia());
    expect(useTeaTimerStore().chimeOn).toBe(false);
  });

  it("hydrates a saved session that has no vessel", () => {
    localStorage.setItem(
      "tea-timer:live",
      JSON.stringify({
        version: 1,
        sessionId: "s-old",
        startedAt: "2026-09-26T17:00:00Z",
        tea: null,
        curve: ALMANAC,
        leafGrams: null,
        waterTempC: null,
        infusions: [{ number: 1, target_seconds: 20, actual_seconds: null }],
        steepStartedAt: null,
        pushed: false,
      }),
    );
    setActivePinia(createPinia());
    const store = useTeaTimerStore();
    expect(store.live?.sessionId).toBe("s-old");
    expect(store.live?.teaware ?? null).toBeNull();
  });
});

describe("resume", () => {
  it("loads a server snapshot and adds the pending steep", () => {
    const session: TeaSession = {
      id: "s-abc",
      brewed_by: "jakub",
      teaware_id: null,
      vessel_volume_ml: null,
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
      away_tea_name: "",
      away_class_id: null,
      timed: true,
      cha_xi: null,
      tasting: null,
      image_url: null,
      infusions: [{ number: 1, target_seconds: 20, actual_seconds: 22 }],
    };
    const store = useTeaTimerStore();
    store.resume(session, tea());
    expect(store.live?.sessionId).toBe("s-abc");
    expect(store.live?.pushed).toBe(true);
    expect(store.current).toEqual({ number: 2, target_seconds: 25, actual_seconds: null });
  });

  it("keeps a fallback vessel when the session has a teaware_id but no item was found", async () => {
    mockCurve(ALMANAC);
    const session: TeaSession = {
      id: "s-abc",
      brewed_by: "jakub",
      teaware_id: "w-1",
      vessel_volume_ml: 110,
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
      away_tea_name: "",
      away_class_id: null,
      timed: true,
      cha_xi: null,
      tasting: null,
      image_url: null,
      infusions: [{ number: 1, target_seconds: 20, actual_seconds: 22 }],
    };
    const store = useTeaTimerStore();
    store.resume(session, tea(), null);
    expect(store.live?.teaware).toEqual({ id: "w-1", name: "your vessel", volume_ml: 110 });
    await store.push();
    expect(putMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ teaware_id: "w-1" }),
    );
  });
});

describe("cha xi", () => {
  async function brewing() {
    mockCurve(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    putMock.mockClear();
    return store;
  }

  it("sends the live cha xi with the next snapshot", async () => {
    const store = await brewing();
    store.setChaXi({ moods: ["calm"], guests: "Eva", notes: "" });
    await store.push();
    const [, body] = putMock.mock.calls.at(-1)!;
    expect((body as { cha_xi: unknown }).cha_xi).toEqual({
      moods: ["calm"],
      guests: "Eva",
      notes: "",
    });
  });

  it("sends the live tasting with the next snapshot, and none for an old stored session", async () => {
    const store = await brewing();
    await store.push();
    expect((putMock.mock.calls.at(-1)![1] as { tasting: unknown }).tasting).toBeNull();

    const tasted = emptyTasting();
    tasted.sensation.throat = 4;
    store.setTasting(tasted);
    await store.push();
    const [, body] = putMock.mock.calls.at(-1)!;
    expect((body as { tasting: Tasting }).tasting.sensation.throat).toBe(4);
  });

  it("hydrates a session stored before cha xi existed", () => {
    localStorage.setItem(
      "tea-timer:live",
      JSON.stringify({
        version: 1,
        sessionId: "s-old",
        startedAt: "2026-09-26T18:00:00Z",
        tea: { id: "t-1", name: "Tieguanyin", class_id: "oolong", grams_remaining: 42 },
        curve: ALMANAC,
        leafGrams: 6,
        waterTempC: 95,
        infusions: [{ number: 1, target_seconds: 20, actual_seconds: null }],
        steepStartedAt: null,
        pushed: true,
      }),
    );
    const store = useTeaTimerStore();
    expect(store.live?.sessionId).toBe("s-old");
    expect(store.live?.chaXi ?? null).toBeNull();
  });

  it("syncs the session before uploading its photo", async () => {
    const store = await brewing();
    uploadMock.mockResolvedValue({ image_url: "/api/tea/sessions/x/image" });
    const ok = await store.uploadPhoto(new File(["x"], "t.jpg", { type: "image/jpeg" }));
    expect(ok).toBe(true);
    expect(putMock).toHaveBeenCalled();
    expect(uploadMock.mock.calls[0][0]).toBe(`/tea/sessions/${store.live!.sessionId}/image`);
    expect(store.live?.imageUrl).toBe("/api/tea/sessions/x/image");
  });

  it("keeps the photo error for a retry when the upload fails", async () => {
    const store = await brewing();
    uploadMock.mockRejectedValue(Object.assign(new Error("x"), { detail: "Too big" }));
    const ok = await store.uploadPhoto(new File(["x"], "t.jpg", { type: "image/jpeg" }));
    expect(ok).toBe(false);
    expect(store.photoError).toBe("Too big");
    expect(store.photoSaving).toBe(false);
    expect(store.live?.imageUrl ?? null).toBeNull();
  });

  it("does not upload while the session cannot sync", async () => {
    const store = await brewing();
    putMock.mockRejectedValue(httpError(503));
    const ok = await store.uploadPhoto(new File(["x"], "t.jpg", { type: "image/jpeg" }));
    expect(ok).toBe(false);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(store.photoError).not.toBeNull();
  });

  it("resumes a server session with its cha xi and photo", () => {
    const store = useTeaTimerStore();
    const saved: TeaSession = {
      id: "s-9",
      tea_id: "t-1",
      away_tea_name: "",
      away_class_id: null,
      status: "in_progress",
      started_at: "2026-09-26T18:00:00Z",
      leaf_grams: 6,
      water_temp_c: 95,
      rating: null,
      curve_source: "almanac",
      curve_source_label: "almanac: Tieguanyin",
      infusions: [{ number: 1, target_seconds: 20, actual_seconds: 21 }],
      teaware_id: null,
      timed: true,
      cha_xi: { moods: ["cosy"], guests: "", notes: "rain" },
      tasting: null,
      brewed_by: "jakub",
      vessel_volume_ml: null,
      updated_at: "2026-09-26T18:05:00Z",
      finished_at: null,
      image_url: "/api/tea/sessions/s-9/image",
    };
    store.resume(saved, tea());
    expect(store.live?.chaXi).toEqual({ moods: ["cosy"], guests: "", notes: "rain" });
    expect(store.live?.imageUrl).toBe("/api/tea/sessions/s-9/image");
  });
});
