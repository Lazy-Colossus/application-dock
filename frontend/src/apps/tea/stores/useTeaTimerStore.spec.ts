import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, putMock, delMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, put: putMock, del: delMock, post: vi.fn() },
}));

import { useTeaTimerStore } from "./useTeaTimerStore";
import type { BrewingCurve, Tea, TeaSession } from "../types";

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

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  getMock.mockReset();
  putMock.mockReset().mockImplementation((_path: string, body: unknown) => Promise.resolve(body));
  delMock.mockReset().mockResolvedValue(undefined);
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
    getMock.mockResolvedValue(ALMANAC);
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
    getMock.mockResolvedValue(ALMANAC);
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

  it("pushes after every steep once a tea is attached", async () => {
    getMock.mockResolvedValue(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    await steep(store, 21);
    expect(putMock).toHaveBeenCalledTimes(2);
  });
});

describe("sync failures", () => {
  it("marks unsynced on a failed push and clears it on the next success", async () => {
    getMock.mockResolvedValue(ALMANAC);
    const store = useTeaTimerStore();
    putMock.mockRejectedValueOnce(httpError(0));
    await store.attachTea(tea());
    expect(store.unsynced).toBe(true);
    await steep(store, 21);
    expect(store.unsynced).toBe(false);
  });

  it("detaches the tea when the server says it is gone", async () => {
    getMock.mockResolvedValue(ALMANAC);
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
    getMock.mockResolvedValue(ALMANAC);
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
});

describe("finishing", () => {
  it("finalises with the rating, clears, and returns the tea id", async () => {
    getMock.mockResolvedValue(ALMANAC);
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
    getMock.mockResolvedValue(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    putMock.mockRejectedValueOnce(httpError(409));
    expect(await store.finish(null)).toBe("t-1");
    expect(store.live).toBeNull();
  });

  it("keeps the session and reports the error when finishing fails", async () => {
    getMock.mockResolvedValue(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    putMock.mockRejectedValueOnce(httpError(500));
    expect(await store.finish(4)).toBeNull();
    expect(store.live).not.toBeNull();
    expect(store.error).toBe("HTTP 500");
    expect(store.loading).toBe(false);
  });
});

describe("discard", () => {
  it("deletes a pushed session on the server", async () => {
    getMock.mockResolvedValue(ALMANAC);
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
    getMock.mockResolvedValue(ALMANAC);
    let resolvePut!: (value: unknown) => void;
    putMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePut = resolve;
        }),
    );
    const store = useTeaTimerStore();
    const attaching = store.attachTea(tea());
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
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
});

describe("resume", () => {
  it("loads a server snapshot and adds the pending steep", () => {
    const session: TeaSession = {
      id: "s-abc",
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
      infusions: [{ number: 1, target_seconds: 20, actual_seconds: 22 }],
    };
    const store = useTeaTimerStore();
    store.resume(session, tea());
    expect(store.live?.sessionId).toBe("s-abc");
    expect(store.live?.pushed).toBe(true);
    expect(store.current).toEqual({ number: 2, target_seconds: 25, actual_seconds: null });
  });
});
