import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import { CUP_LIQUOR, genericCurve, newSessionId, targetFor } from "@/apps/tea/timer";
import type {
  BrewingCurve,
  Infusion,
  Tea,
  TeaClass,
  TeaSession,
  TeaSessionWrite,
} from "@/apps/tea/types";

export interface LiveTea {
  id: string;
  name: string;
  class_id: TeaClass;
  grams_remaining: number;
}

export interface LiveSession {
  version: 1;
  sessionId: string;
  startedAt: string;
  tea: LiveTea | null;
  curve: BrewingCurve;
  leafGrams: number | null;
  waterTempC: number | null;
  infusions: Infusion[];
  steepStartedAt: number | null;
  pushed: boolean;
}

const LIVE_KEY = "tea-timer:live";
const CHIME_KEY = "tea-timer:chime";

function message(e: unknown): string {
  if (e && typeof e === "object" && "detail" in e) {
    const detail = (e as { detail: unknown }).detail;
    if (typeof detail === "string" && detail.length > 0) return detail;
  }
  return e instanceof Error ? e.message : String(e);
}

function statusOf(e: unknown): number | null {
  if (e && typeof e === "object" && "status" in e) {
    const status = (e as { status: unknown }).status;
    if (typeof status === "number") return status;
  }
  return null;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the timer still works, it just won't
    // survive a reload.
  }
}

function isLiveSession(value: unknown): value is LiveSession {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 1 &&
    typeof v.sessionId === "string" &&
    typeof v.startedAt === "string" &&
    Array.isArray(v.infusions) &&
    v.infusions.length > 0 &&
    typeof v.curve === "object" &&
    v.curve !== null &&
    (v.steepStartedAt === null || typeof v.steepStartedAt === "number")
  );
}

function hydrate(): LiveSession | null {
  const raw = read(LIVE_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isLiveSession(parsed)) return parsed;
  } catch {
    // fall through
  }
  write(LIVE_KEY, null);
  return null;
}

function liveTea(tea: Tea): LiveTea {
  return {
    id: tea.id,
    name: tea.name,
    class_id: tea.class_id,
    grams_remaining: tea.grams_remaining,
  };
}

export const useTeaTimerStore = defineStore("tea-timer", () => {
  const live = ref<LiveSession | null>(hydrate());
  const unsynced = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const notice = ref<string | null>(null);
  const chimeOn = ref(read(CHIME_KEY) !== "0");

  // Synchronous so a reload straight after a tap still finds the tap saved.
  watch(live, (value) => write(LIVE_KEY, value === null ? null : JSON.stringify(value)), {
    deep: true,
    flush: "sync",
  });

  const current = computed(() => live.value?.infusions.at(-1) ?? null);
  const running = computed(() => live.value?.steepStartedAt != null);
  const brewed = computed(
    () => live.value?.infusions.filter((i) => i.actual_seconds !== null) ?? [],
  );
  const liquor = computed(() => CUP_LIQUOR[live.value?.tea?.class_id ?? "other"]);

  function ensureSession(): LiveSession {
    if (live.value === null) {
      const curve = genericCurve();
      live.value = {
        version: 1,
        sessionId: newSessionId(),
        startedAt: new Date().toISOString(),
        tea: null,
        curve,
        leafGrams: null,
        waterTempC: null,
        infusions: [
          { number: 1, target_seconds: targetFor(curve.steep_seconds, 1), actual_seconds: null },
        ],
        steepStartedAt: null,
        pushed: false,
      };
    }
    return live.value;
  }

  /** `session.tea` must be set before this is called — see `push`/`finish`. */
  function snapshot(
    session: LiveSession,
    tea: LiveTea,
    status: TeaSessionWrite["status"],
    rating: number | null,
  ): TeaSessionWrite {
    return {
      tea_id: tea.id,
      status,
      started_at: session.startedAt,
      leaf_grams: session.leafGrams,
      water_temp_c: session.waterTempC,
      rating,
      curve_source: session.curve.source,
      curve_source_label: session.curve.source_label,
      infusions: session.infusions,
    };
  }

  function clear(): void {
    live.value = null;
    unsynced.value = false;
    error.value = null;
  }

  async function push(): Promise<void> {
    const session = live.value;
    const tea = session?.tea;
    if (!session || !tea) return;
    // Mark as pushed before the request lands, not after: a discard tapped
    // while this PUT is in flight must still DELETE, whether the PUT
    // eventually succeeds, fails, or its response is simply lost.
    session.pushed = true;
    try {
      await api.put<TeaSession>(`/tea/sessions/${session.sessionId}`, {
        ...snapshot(session, tea, "in_progress", null),
      });
      // The session may have ended, been discarded, or been replaced (finish,
      // resume, a fresh start) while this request was in flight — a stale
      // result must not resurrect state on whatever session is live now.
      if (live.value !== session) return;
      unsynced.value = false;
    } catch (e) {
      if (live.value !== session) return;
      if (statusOf(e) === 404) {
        // The tea was removed elsewhere: keep timing as a plain timer rather
        // than retrying a push that can never land.
        notice.value = `${tea.name} is no longer in your cabinet — carrying on as a plain timer.`;
        session.tea = null;
        unsynced.value = false;
        return;
      }
      unsynced.value = true;
    }
  }

  function start(): void {
    const session = ensureSession();
    if (session.steepStartedAt === null) session.steepStartedAt = Date.now();
  }

  async function stop(): Promise<void> {
    const session = live.value;
    if (!session || session.steepStartedAt === null) return;
    const pending = session.infusions.at(-1);
    if (!pending) return;
    pending.actual_seconds = Math.max(0, Math.round((Date.now() - session.steepStartedAt) / 1000));
    session.steepStartedAt = null;
    const next = pending.number + 1;
    session.infusions.push({
      number: next,
      target_seconds: targetFor(session.curve.steep_seconds, next),
      actual_seconds: null,
    });
    await push();
  }

  function nudge(deltaSeconds: number): void {
    const pending = ensureSession().infusions.at(-1);
    if (!pending) return;
    pending.target_seconds = Math.max(1, pending.target_seconds + deltaSeconds);
  }

  async function redoLast(): Promise<void> {
    const session = live.value;
    if (!session || session.steepStartedAt !== null || session.infusions.length < 2) return;
    session.infusions.pop();
    const previous = session.infusions.at(-1);
    if (!previous) return;
    previous.actual_seconds = null;
    await push();
  }

  async function attachTea(tea: Tea): Promise<void> {
    const session = ensureSession();
    let curve: BrewingCurve;
    try {
      curve = await api.get<BrewingCurve>(`/tea/teas/${tea.id}/curve`);
    } catch {
      curve = genericCurve("generic gongfu (couldn't load tea curve)");
    }
    // The session may have ended or been replaced while the curve fetch was
    // in flight — don't attach the tea to a detached object.
    if (live.value !== session) return;
    session.tea = liveTea(tea);
    session.curve = curve;
    session.leafGrams = curve.leaf_grams;
    session.waterTempC = curve.water_temp_c;
    session.infusions = session.infusions.map((i) =>
      i.actual_seconds === null
        ? { ...i, target_seconds: targetFor(curve.steep_seconds, i.number) }
        : i,
    );
    notice.value = null;
    await push();
  }

  function setLeafGrams(grams: number | null): void {
    if (live.value) live.value.leafGrams = grams !== null && grams > 0 ? grams : null;
  }

  function setWaterTemp(celsius: number | null): void {
    if (live.value) live.value.waterTempC = celsius;
  }

  async function finish(rating: number | null): Promise<string | null> {
    const session = live.value;
    const tea = session?.tea;
    if (!session || !tea) return null;
    const teaId = tea.id;
    loading.value = true;
    try {
      await api.put<TeaSession>(`/tea/sessions/${session.sessionId}`, {
        ...snapshot(session, tea, "finalised", rating),
      });
      clear();
      return teaId;
    } catch (e) {
      // 409: an earlier attempt landed but its response was lost.
      if (statusOf(e) === 409) {
        clear();
        return teaId;
      }
      error.value = message(e);
      return null;
    } finally {
      loading.value = false;
    }
  }

  function end(): void {
    clear();
    notice.value = null;
  }

  async function discard(): Promise<boolean> {
    const session = live.value;
    if (!session) return true;
    if (session.pushed) {
      loading.value = true;
      try {
        await api.del(`/tea/sessions/${session.sessionId}`);
      } catch (e) {
        if (statusOf(e) !== 404) {
          error.value = message(e);
          return false;
        }
      } finally {
        loading.value = false;
      }
    }
    end();
    return true;
  }

  function resume(session: TeaSession, tea: Tea): void {
    const infusions = session.infusions.map((i) => ({ ...i }));
    const curve: BrewingCurve = {
      leaf_grams: session.leaf_grams,
      water_temp_c: session.water_temp_c,
      steep_seconds: infusions.map((i) => i.target_seconds),
      source: session.curve_source,
      source_label: session.curve_source_label,
    };
    const last = infusions.at(-1);
    if (!last || last.actual_seconds !== null) {
      const next = (last?.number ?? 0) + 1;
      infusions.push({
        number: next,
        target_seconds: targetFor(curve.steep_seconds, next),
        actual_seconds: null,
      });
    }
    live.value = {
      version: 1,
      sessionId: session.id,
      startedAt: session.started_at,
      tea: liveTea(tea),
      curve,
      leafGrams: session.leaf_grams,
      waterTempC: session.water_temp_c,
      infusions,
      steepStartedAt: null,
      pushed: true,
    };
    unsynced.value = false;
  }

  function toggleChime(): void {
    chimeOn.value = !chimeOn.value;
    write(CHIME_KEY, chimeOn.value ? "1" : "0");
  }

  if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
      if (unsynced.value) void push();
    });
  }

  return {
    live,
    unsynced,
    loading,
    error,
    notice,
    chimeOn,
    current,
    running,
    brewed,
    liquor,
    start,
    stop,
    nudge,
    redoLast,
    attachTea,
    setLeafGrams,
    setWaterTemp,
    push,
    finish,
    end,
    discard,
    resume,
    toggleChime,
  };
});
