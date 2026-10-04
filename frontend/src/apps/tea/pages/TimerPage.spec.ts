import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, putMock, delMock, push, replace, routeQuery } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  routeQuery: { value: {} as Record<string, string> },
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, put: putMock, del: delMock, post: vi.fn() },
}));
vi.mock("vue-router", () => ({
  useRouter: () => ({ push, replace }),
  useRoute: () => ({ query: routeQuery.value }),
}));

import TimerPage from "./TimerPage.vue";
import { useTeaTimerStore } from "../stores/useTeaTimerStore";
import type { BrewingCurve, Tea, TeaSession } from "../types";

function tea(): Tea {
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
  };
}

function httpError(status: number): Error {
  return Object.assign(new Error(`${status}`), { status, detail: `HTTP ${status}` });
}

function tea2(): Tea {
  return { ...tea(), id: "t-2", name: "Dragonwell", class_id: "green" };
}

const CURVE: BrewingCurve = {
  leaf_grams: 6,
  water_temp_c: 95,
  steep_seconds: [20, 25],
  source: "almanac",
  source_label: "almanac: Tieguanyin",
};

const CURVE_2: BrewingCurve = {
  leaf_grams: 4,
  water_temp_c: 80,
  steep_seconds: [15, 20],
  source: "almanac",
  source_label: "almanac: Dragonwell",
};

function routes(inProgress: TeaSession[] = []) {
  getMock.mockImplementation((path: string) => {
    if (path.startsWith("/tea/teaware/last-used")) return Promise.resolve(null);
    if (path === "/tea/teas") return Promise.resolve([tea(), tea2()]);
    if (path === "/tea/sessions?status=in_progress") return Promise.resolve(inProgress);
    if (path === "/tea/teas/t-1/curve") return Promise.resolve(CURVE);
    if (path === "/tea/teas/t-2/curve") return Promise.resolve(CURVE_2);
    return Promise.resolve([]);
  });
}

function localLiveSession(infusions: TeaSession["infusions"]): string {
  return JSON.stringify({
    version: 1,
    sessionId: "s-a",
    startedAt: "2026-09-26T17:00:00Z",
    tea: { id: "t-1", name: "Tieguanyin", class_id: "oolong", grams_remaining: 42 },
    curve: CURVE,
    leafGrams: 6,
    waterTempC: 95,
    infusions,
    steepStartedAt: null,
    pushed: true,
  });
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  getMock.mockReset();
  putMock.mockReset().mockImplementation((_p: string, body: unknown) => Promise.resolve(body));
  delMock.mockReset().mockResolvedValue(undefined);
  push.mockReset();
  replace.mockReset();
  routeQuery.value = {};
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-26T18:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

function openSession(overrides: Partial<TeaSession> = {}): TeaSession {
  return {
    id: "s-9",
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
    infusions: [{ number: 1, target_seconds: 20, actual_seconds: 21 }],
    ...overrides,
  };
}

describe("TimerPage", () => {
  it("offers Cha Xi only once a tea is attached", async () => {
    routes();
    const wrapper = mount(TimerPage);
    await flushPromises();
    expect(wrapper.find("[data-testid=timer-chaxi]").exists()).toBe(false);
  });

  it("opens Cha Xi, marked once the session has any", async () => {
    routes();
    localStorage.setItem(
      "tea-timer:live",
      localLiveSession([{ number: 1, target_seconds: 20, actual_seconds: null }]),
    );
    const wrapper = mount(TimerPage);
    await flushPromises();
    expect(wrapper.find("[data-testid=timer-chaxi-dot]").exists()).toBe(false);

    useTeaTimerStore().setChaXi({ moods: ["calm"], guests: "", notes: "" });
    await flushPromises();
    expect(wrapper.find("[data-testid=timer-chaxi-dot]").exists()).toBe(true);

    await wrapper.get("[data-testid=timer-chaxi]").trigger("click");
    expect(push).toHaveBeenCalledWith({ name: "tea-timer-chaxi" });
  });

  it("opens as a plain timer ready to start", async () => {
    routes();
    const wrapper = mount(TimerPage);
    await flushPromises();
    expect(wrapper.get("[data-testid=timer-tea]").text()).toContain("pick a tea");
    expect(wrapper.get("[data-testid=timer-band]").text()).toContain("tap to start");
    expect(wrapper.get("[data-testid=timer-finish]").text()).toBe("End");
  });

  it("starts and stops a steep from the band", async () => {
    routes();
    const wrapper = mount(TimerPage);
    await flushPromises();
    await wrapper.get("[data-testid=timer-band]").trigger("click");
    expect(wrapper.get("[data-testid=timer-band]").text()).toContain("tap to stop");
    vi.setSystemTime(Date.now() + 11_000);
    await wrapper.get("[data-testid=timer-band]").trigger("click");
    await flushPromises();
    expect(wrapper.get("[data-testid=timer-chip-1]").text()).toBe("1 · 11s");
  });

  it("attaches the tea from ?tea= and shows its curve source", async () => {
    routes();
    routeQuery.value = { tea: "t-1" };
    const wrapper = mount(TimerPage);
    await flushPromises();
    expect(wrapper.get("[data-testid=timer-tea]").text()).toContain("Tieguanyin");
    expect(wrapper.get("[data-testid=timer-source]").text()).toBe("almanac: Tieguanyin");
    expect(wrapper.get("[data-testid=timer-finish]").text()).toBe("Finish");
  });

  it("offers to resume an unfinished server session", async () => {
    routes([
      {
        id: "s-9",
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
        infusions: [{ number: 1, target_seconds: 20, actual_seconds: 21 }],
      },
    ]);
    const wrapper = mount(TimerPage);
    await flushPromises();
    await wrapper.get("[data-testid=recovery-resume]").trigger("click");
    expect(useTeaTimerStore().live?.sessionId).toBe("s-9");
    expect(wrapper.find("[data-testid=recovery-card]").exists()).toBe(false);
  });

  it("resumes an unfinished server session for ?tea= automatically, without fetching its curve", async () => {
    routes([
      {
        id: "s-9",
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
        infusions: [{ number: 1, target_seconds: 20, actual_seconds: 21 }],
      },
    ]);
    routeQuery.value = { tea: "t-1" };
    mount(TimerPage);
    await flushPromises();
    expect(useTeaTimerStore().live?.sessionId).toBe("s-9");
    expect(getMock).not.toHaveBeenCalledWith("/tea/teas/t-1/curve");
  });

  it("parks a brewed session to start a different tea", async () => {
    routes();
    localStorage.setItem(
      "tea-timer:live",
      localLiveSession([
        { number: 1, target_seconds: 20, actual_seconds: 21 },
        { number: 2, target_seconds: 25, actual_seconds: null },
      ]),
    );
    routeQuery.value = { tea: "t-2" };
    mount(TimerPage);
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith(
      "/tea/sessions/s-a",
      expect.objectContaining({ tea_id: "t-1", status: "in_progress" }),
    );
    const live = useTeaTimerStore().live;
    expect(live?.tea?.id).toBe("t-2");
    expect(live?.sessionId).not.toBe("s-a");
  });

  it("parks a brewed session and continues the requested tea's open one", async () => {
    routes([openSession({ id: "s-8", tea_id: "t-2" })]);
    localStorage.setItem(
      "tea-timer:live",
      localLiveSession([
        { number: 1, target_seconds: 20, actual_seconds: 21 },
        { number: 2, target_seconds: 25, actual_seconds: null },
      ]),
    );
    routeQuery.value = { tea: "t-2" };
    mount(TimerPage);
    await flushPromises();
    expect(useTeaTimerStore().live?.sessionId).toBe("s-8");
  });

  it("won't switch tea mid-steep", async () => {
    routes();
    localStorage.setItem(
      "tea-timer:live",
      JSON.stringify({
        ...JSON.parse(
          localLiveSession([
            { number: 1, target_seconds: 20, actual_seconds: 21 },
            { number: 2, target_seconds: 25, actual_seconds: null },
          ]),
        ),
        steepStartedAt: Date.now() - 5_000,
      }),
    );
    routeQuery.value = { tea: "t-2" };
    const wrapper = mount(TimerPage);
    await flushPromises();
    expect(useTeaTimerStore().live?.tea?.id).toBe("t-1");
    expect(putMock).not.toHaveBeenCalled();
    expect(wrapper.get("[data-testid=timer-notice]").text()).toBe(
      "Your Tieguanyin steep is still running — stop it before brewing Dragonwell.",
    );
  });

  it("still swaps to a different tea when the unfinished session has no brewed steeps", async () => {
    routes();
    localStorage.setItem(
      "tea-timer:live",
      localLiveSession([{ number: 1, target_seconds: 20, actual_seconds: null }]),
    );
    routeQuery.value = { tea: "t-2" };
    const wrapper = mount(TimerPage);
    await flushPromises();
    expect(useTeaTimerStore().live?.tea?.id).toBe("t-2");
    expect(wrapper.find("[data-testid=timer-notice]").exists()).toBe(false);
  });

  it("shows a failed recovery fetch", async () => {
    getMock.mockImplementation((path: string) => {
      if (path.startsWith("/tea/teaware/last-used")) return Promise.resolve(null);
      if (path === "/tea/teas") return Promise.resolve([tea(), tea2()]);
      if (path === "/tea/sessions?status=in_progress") return Promise.reject(httpError(500));
      return Promise.resolve([]);
    });
    const wrapper = mount(TimerPage);
    await flushPromises();
    expect(wrapper.get("[data-testid=timer-sessions-error]").text()).toContain("HTTP 500");
  });

  it("finishes, refreshes the cabinet and goes to the tea", async () => {
    routes();
    routeQuery.value = { tea: "t-1" };
    const wrapper = mount(TimerPage);
    await flushPromises();
    await wrapper.get("[data-testid=timer-finish]").trigger("click");
    await wrapper.get("[data-testid=finish-save]").trigger("click");
    await flushPromises();
    expect(putMock.mock.calls.at(-1)![1]).toMatchObject({ status: "finalised" });
    expect(replace).toHaveBeenCalledWith({ name: "tea-detail", params: { teaId: "t-1" } });
    expect(push).not.toHaveBeenCalled();
  });

  it("closes the finish sheet when the tea was deleted elsewhere", async () => {
    routes();
    routeQuery.value = { tea: "t-1" };
    putMock.mockImplementation((_path: string, body: { status: string }) => {
      if (body.status === "finalised") return Promise.reject(httpError(404));
      return Promise.resolve(body);
    });
    const wrapper = mount(TimerPage);
    await flushPromises();
    await wrapper.get("[data-testid=timer-finish]").trigger("click");
    expect(wrapper.find("[data-testid=finish-save]").exists()).toBe(true);
    await wrapper.get("[data-testid=finish-save]").trigger("click");
    await flushPromises();
    expect(wrapper.find("[data-testid=finish-save]").exists()).toBe(false);
    expect(useTeaTimerStore().notice).toContain("Tieguanyin");
  });

  it("attaches the tea without waiting for the teaware fetch", async () => {
    let resolveTeaware!: (value: unknown) => void;
    getMock.mockImplementation((path: string) => {
      if (path === "/tea/teaware") return new Promise((resolve) => (resolveTeaware = resolve));
      if (path.startsWith("/tea/teaware/last-used")) return Promise.resolve(null);
      if (path === "/tea/teas") return Promise.resolve([tea(), tea2()]);
      if (path === "/tea/sessions?status=in_progress") return Promise.resolve([]);
      if (path === "/tea/teas/t-1/curve") return Promise.resolve(CURVE);
      return Promise.resolve([]);
    });
    routeQuery.value = { tea: "t-1" };
    const wrapper = mount(TimerPage);
    await flushPromises();
    expect(wrapper.get("[data-testid=timer-tea]").text()).toContain("Tieguanyin");
    resolveTeaware([]);
    await flushPromises();
  });

  it("shows the vessel, and picks another from the sheet", async () => {
    getMock.mockImplementation((path: string) => {
      if (path.startsWith("/tea/teaware/last-used")) return Promise.resolve(null);
      if (path === "/tea/teaware")
        return Promise.resolve([
          {
            id: "w-1", name: "Zhuni", type: "pot", material: "clay", volume_ml: 110, porous: false,
            dedicated_node_id: null, maker: "", origin: "", acquired_date: null, price_paid: null,
            notes: "", image_url: null, retired_at: null,
            created_at: "2026-09-27T10:00:00Z", updated_at: "2026-09-27T10:00:00Z",
          },
        ]);
      if (path === "/tea/teas") return Promise.resolve([tea(), tea2()]);
      if (path === "/tea/sessions?status=in_progress") return Promise.resolve([]);
      if (path === "/tea/teas/t-1/curve") return Promise.resolve(CURVE);
      return Promise.resolve([]);
    });
    const wrapper = mount(TimerPage);
    await flushPromises();
    expect(wrapper.get("[data-testid=timer-vessel]").text()).toContain("+ vessel");

    await wrapper.get("[data-testid=timer-vessel]").trigger("click");
    await wrapper.get("[data-testid=vessel-w-1]").trigger("click");
    await flushPromises();
    expect(wrapper.get("[data-testid=timer-vessel]").text()).toContain("in Zhuni · 110 ml");
    expect(wrapper.find("[data-testid=vessel-sheet]").exists()).toBe(false);
  });
  it("edits the leaf grams for this brew and syncs them", async () => {
    routes();
    routeQuery.value = { tea: "t-1" };
    const wrapper = mount(TimerPage);
    await flushPromises();
    expect(wrapper.get("[data-testid=timer-leaf]").text()).toContain("6 g leaf");

    await wrapper.get("[data-testid=timer-leaf]").trigger("click");
    await wrapper.get("[data-testid=leaf-grams]").setValue("7.5");
    await wrapper.get("[data-testid=leaf-save]").trigger("click");
    await flushPromises();

    expect(wrapper.get("[data-testid=timer-leaf]").text()).toContain("7.5 g leaf");
    expect(wrapper.find("[data-testid=leaf-sheet]").exists()).toBe(false);
    expect(putMock.mock.calls.at(-1)![1]).toMatchObject({ leaf_grams: 7.5 });
  });

  it("rewrites a previous steep's time from its pill and syncs it", async () => {
    routes();
    localStorage.setItem(
      "tea-timer:live",
      localLiveSession([
        { number: 1, target_seconds: 20, actual_seconds: 95 },
        { number: 2, target_seconds: 25, actual_seconds: null },
      ]),
    );
    const wrapper = mount(TimerPage);
    await flushPromises();

    expect(wrapper.get("[data-testid=timer-chip-2]").element.tagName).toBe("SPAN");
    await wrapper.get("[data-testid=timer-chip-1]").trigger("click");
    const input = wrapper.get("[data-testid=steep-seconds]");
    expect((input.element as HTMLInputElement).value).toBe("95");
    await input.setValue("0:30");
    await wrapper.get("[data-testid=steep-save]").trigger("click");
    await flushPromises();

    expect(wrapper.get("[data-testid=timer-chip-1]").text()).toBe("1 · 30s");
    expect(wrapper.find("[data-testid=steep-sheet]").exists()).toBe(false);
    expect(putMock.mock.calls.at(-1)![1]).toMatchObject({
      infusions: [{ number: 1, actual_seconds: 30 }, { number: 2 }],
    });
  });

  it("shows a picker of open sessions instead of the timer when nothing is live", async () => {
    routes([openSession(), openSession({ id: "s-8", tea_id: "t-2" })]);
    const wrapper = mount(TimerPage);
    await flushPromises();
    expect(wrapper.findAll("[data-testid=recovery-card]")).toHaveLength(2);
    expect(wrapper.find("[data-testid=timer-band]").exists()).toBe(false);

    await wrapper.get("[data-testid=timer-new-brew]").trigger("click");
    expect(wrapper.find("[data-testid=timer-picker]").exists()).toBe(false);
    expect(wrapper.get("[data-testid=timer-band]").text()).toContain("tap to start");
  });

  it("falls through to the timer once the last open session is discarded", async () => {
    routes([openSession()]);
    const wrapper = mount(TimerPage);
    await flushPromises();
    await wrapper.get("[data-testid=recovery-discard]").trigger("click");
    await flushPromises();
    expect(wrapper.find("[data-testid=timer-picker]").exists()).toBe(false);
    expect(wrapper.find("[data-testid=timer-band]").exists()).toBe(true);
  });

  it("switches away from a session, then lists it to continue", async () => {
    routes();
    localStorage.setItem(
      "tea-timer:live",
      localLiveSession([
        { number: 1, target_seconds: 20, actual_seconds: 21 },
        { number: 2, target_seconds: 25, actual_seconds: null },
      ]),
    );
    const wrapper = mount(TimerPage);
    await flushPromises();
    routes([openSession({ id: "s-a" })]);

    await wrapper.get("[data-testid=timer-menu]").trigger("click");
    await wrapper.get("[data-testid=timer-switch]").trigger("click");
    await flushPromises();

    expect(useTeaTimerStore().live).toBeNull();
    expect(putMock.mock.calls.at(-1)![1]).toMatchObject({ status: "in_progress" });
    expect(wrapper.find("[data-testid=timer-picker]").exists()).toBe(true);
    await wrapper.get("[data-testid=recovery-resume]").trigger("click");
    expect(useTeaTimerStore().live?.sessionId).toBe("s-a");
  });

  it("shows the picker, not a startable timer, while the list reloads after a switch", async () => {
    routes();
    localStorage.setItem(
      "tea-timer:live",
      localLiveSession([
        { number: 1, target_seconds: 20, actual_seconds: 21 },
        { number: 2, target_seconds: 25, actual_seconds: null },
      ]),
    );
    const wrapper = mount(TimerPage);
    await flushPromises();
    let land!: (sessions: TeaSession[]) => void;
    getMock.mockImplementation((path: string) =>
      path === "/tea/sessions?status=in_progress"
        ? new Promise((resolve) => (land = resolve))
        : Promise.resolve([]),
    );

    await wrapper.get("[data-testid=timer-menu]").trigger("click");
    await wrapper.get("[data-testid=timer-switch]").trigger("click");
    await flushPromises();
    expect(useTeaTimerStore().live).toBeNull();
    expect(wrapper.find("[data-testid=timer-band]").exists()).toBe(false);

    land([openSession({ id: "s-a" })]);
    await flushPromises();
    expect(wrapper.findAll("[data-testid=recovery-card]")).toHaveLength(1);
  });

  it("brings the picker back once a new brew is discarded", async () => {
    routes([openSession()]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const wrapper = mount(TimerPage);
    await flushPromises();
    await wrapper.get("[data-testid=timer-new-brew]").trigger("click");
    await wrapper.get("[data-testid=timer-band]").trigger("click");
    vi.setSystemTime(Date.now() + 11_000);
    await wrapper.get("[data-testid=timer-band]").trigger("click");
    await flushPromises();

    await wrapper.get("[data-testid=timer-menu]").trigger("click");
    await wrapper.get("[data-testid=timer-discard]").trigger("click");
    await flushPromises();
    expect(wrapper.find("[data-testid=timer-picker]").exists()).toBe(true);
  });

  it("drops ?tea= after a switch, so a reload shows the picker", async () => {
    routes();
    localStorage.setItem(
      "tea-timer:live",
      localLiveSession([
        { number: 1, target_seconds: 20, actual_seconds: 21 },
        { number: 2, target_seconds: 25, actual_seconds: null },
      ]),
    );
    routeQuery.value = { tea: "t-1" };
    const wrapper = mount(TimerPage);
    await flushPromises();
    await wrapper.get("[data-testid=timer-menu]").trigger("click");
    await wrapper.get("[data-testid=timer-switch]").trigger("click");
    await flushPromises();
    expect(replace).toHaveBeenCalledWith({ name: "tea-timer" });
  });

  it("keeps the session when switching fails", async () => {
    routes();
    localStorage.setItem(
      "tea-timer:live",
      localLiveSession([
        { number: 1, target_seconds: 20, actual_seconds: 21 },
        { number: 2, target_seconds: 25, actual_seconds: null },
      ]),
    );
    putMock.mockRejectedValue(httpError(0));
    const wrapper = mount(TimerPage);
    await flushPromises();

    await wrapper.get("[data-testid=timer-menu]").trigger("click");
    await wrapper.get("[data-testid=timer-switch]").trigger("click");
    await flushPromises();

    expect(useTeaTimerStore().live?.sessionId).toBe("s-a");
    expect(wrapper.get("[data-testid=timer-error]").text()).toContain("Couldn't save");
  });

  it("offers Switch session only for a tea session, and not mid-steep", async () => {
    routes();
    const plain = mount(TimerPage);
    await flushPromises();
    await plain.get("[data-testid=timer-menu]").trigger("click");
    expect(plain.find("[data-testid=timer-switch]").exists()).toBe(false);
    plain.unmount();

    localStorage.setItem(
      "tea-timer:live",
      localLiveSession([{ number: 1, target_seconds: 20, actual_seconds: null }]),
    );
    setActivePinia(createPinia());
    const wrapper = mount(TimerPage);
    await flushPromises();
    await wrapper.get("[data-testid=timer-band]").trigger("click");
    await wrapper.get("[data-testid=timer-menu]").trigger("click");
    expect(wrapper.get("[data-testid=timer-switch]").attributes("disabled")).toBeDefined();
  });

  it("edits the next steep's target from the cup's label", async () => {
    routes();
    const wrapper = mount(TimerPage);
    await flushPromises();
    await wrapper.get("[data-testid=cup-target-edit]").trigger("click");
    expect(wrapper.get("[data-testid=steep-sheet]").text()).toContain("Target for infusion 1");
    await wrapper.get("[data-testid=steep-seconds]").setValue("0:45");
    await wrapper.get("[data-testid=steep-save]").trigger("click");
    await flushPromises();
    expect(wrapper.get("[data-testid=cup-target-label]").text()).toBe("45s");
    expect(wrapper.find("[data-testid=steep-sheet]").exists()).toBe(false);
  });

  it("tints the band while a steep is running", async () => {
    routes();
    const wrapper = mount(TimerPage);
    await flushPromises();
    const band = () => wrapper.get("[data-testid=timer-band]");
    expect(band().classes()).not.toContain("timer__band--running");
    await band().trigger("click");
    expect(band().classes()).toContain("timer__band--running");
  });

  it("hides the leaf control until a tea is attached", async () => {
    routes();
    const wrapper = mount(TimerPage);
    await flushPromises();
    expect(wrapper.find("[data-testid=timer-leaf]").exists()).toBe(false);
  });
  it("opens one sheet at a time, behind a backdrop that closes it like Done", async () => {
    routes();
    routeQuery.value = { tea: "t-1" };
    const wrapper = mount(TimerPage);
    await flushPromises();

    await wrapper.get("[data-testid=timer-tea]").trigger("click");
    await wrapper.get("[data-testid=timer-vessel]").trigger("click");
    expect(wrapper.find("[data-testid=pick-sheet]").exists()).toBe(true);
    expect(wrapper.find("[data-testid=vessel-sheet]").exists()).toBe(false);

    await wrapper.get("[data-testid=timer-scrim]").trigger("click");
    expect(wrapper.find("[data-testid=pick-sheet]").exists()).toBe(false);
    expect(wrapper.find("[data-testid=timer-scrim]").exists()).toBe(false);

    await wrapper.get("[data-testid=timer-vessel]").trigger("click");
    expect(wrapper.find("[data-testid=vessel-sheet]").exists()).toBe(true);
  });
});
