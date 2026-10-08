import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { api, ApiError } from "@/composables/useApi";
import type { Brush } from "../codes";
import type { PieceDraft } from "../furniture";
import { paint, resize, type Cell, type PlanGrid } from "../grid";
import * as hist from "../history";
import type {
  Apartment,
  ApartmentSummary,
  Label,
  Placement,
  SaveState,
} from "../types";

const ROOT = "/floor-planner/apartments";
/** How long drawing pauses before the plan saves itself (FP-9). */
export const AUTOSAVE_MS = 1500;

function message(e: unknown): string {
  if (e instanceof ApiError && e.detail) return e.detail;
  return e instanceof Error ? e.message : String(e);
}

function planOf(a: Apartment): PlanGrid {
  return {
    cols: a.cols,
    rows: a.rows,
    surface: a.surface,
    feature: a.feature,
    labels: a.labels,
  };
}

export const useFloorPlanStore = defineStore("floor-planner", () => {
  const apartments = ref<ApartmentSummary[]>([]);
  const apartment = ref<Apartment | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);
  /** Someone else's write won; the view was reloaded. Not an error. */
  const notice = ref<string | null>(null);
  /** True while `notice` is a plan-save conflict that still holds the local drawing. */
  const planConflict = ref(false);
  /**
   * Painting happens here and is saved automatically. The history outlives each
   * save, so undo keeps working; `savedPlan` is the snapshot the server holds.
   */
  const draft = ref<hist.History<PlanGrid> | null>(null);
  const savedPlan = ref<PlanGrid | null>(null);
  /** The `plan_rev` the draft's history is based on. */
  let draftPlanRev = -1;
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  let inflight: Promise<boolean> | null = null;

  const dirty = computed(
    () => draft.value !== null && draft.value.present !== savedPlan.value,
  );
  const canUndo = computed(() =>
    draft.value ? hist.canUndo(draft.value) : false,
  );
  const canRedo = computed(() =>
    draft.value ? hist.canRedo(draft.value) : false,
  );
  const plan = computed<PlanGrid | null>(() =>
    draft.value
      ? draft.value.present
      : apartment.value
        ? planOf(apartment.value)
        : null,
  );
  const saveState = computed<SaveState | null>(() =>
    saving.value
      ? "saving"
      : dirty.value
        ? "unsaved"
        : draft.value
          ? "saved"
          : null,
  );

  // Someone else's plan write (or a lock) moved the plan on under a clean draft:
  // its undo steps would paint over their change, so start again from theirs.
  watch(
    () => apartment.value?.plan_rev,
    (rev) => {
      if (draft.value && !dirty.value && rev !== draftPlanRev) resetDraft();
    },
    { flush: "sync" },
  );

  function resetDraft(): void {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = null;
    draft.value = null;
    savedPlan.value = null;
  }

  const base = () => `${ROOT}/${apartment.value?.id ?? ""}`;

  async function fetchApartments(): Promise<ApartmentSummary[]> {
    try {
      apartments.value = await api.get<ApartmentSummary[]>(ROOT);
      error.value = null;
    } catch (e) {
      error.value = message(e);
    }
    return apartments.value;
  }

  async function openApartment(id: string): Promise<boolean> {
    loading.value = true;
    try {
      const next = await api.get<Apartment>(
        `${ROOT}/${encodeURIComponent(id)}`,
      );
      resetDraft();
      dismissNotice();
      apartment.value = next;
      error.value = null;
      return true;
    } catch (e) {
      error.value = message(e);
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function refetchQuietly(): Promise<void> {
    try {
      apartment.value = await api.get<Apartment>(base());
    } catch {
      // The write's message is already shown; a failed refetch adds nothing.
    }
  }

  /** Every write returns the whole apartment; a rejected one refetches so the view reconverges. */
  async function write(call: () => Promise<Apartment>): Promise<boolean> {
    loading.value = true;
    try {
      apartment.value = await call();
      error.value = null;
      notice.value = null;
      planConflict.value = false;
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        notice.value = `${e.detail}, reloaded`;
        error.value = null;
      } else {
        error.value = message(e);
      }
      await refetchQuietly();
      return false;
    } finally {
      loading.value = false;
    }
  }

  const baseRev = () => ({ base_rev: apartment.value?.plan_rev ?? 0 });

  const lock = () =>
    write(() => api.post<Apartment>(`${base()}/lock`, baseRev()));
  const unlock = () =>
    write(() => api.post<Apartment>(`${base()}/unlock`, baseRev()));
  const addMember = (username: string) =>
    write(() => api.post<Apartment>(`${base()}/members`, { username }));
  const removeMember = (username: string) =>
    write(() =>
      api.del<Apartment>(`${base()}/members/${encodeURIComponent(username)}`),
    );

  /** Creates or copies an apartment and opens it; returns its id. */
  async function adopt(call: () => Promise<Apartment>): Promise<string | null> {
    if (!(await flush())) return null;
    loading.value = true;
    try {
      const created = await call();
      resetDraft();
      dismissNotice();
      apartment.value = created;
      error.value = null;
      await fetchApartments();
      return created.id;
    } catch (e) {
      error.value = message(e);
      return null;
    } finally {
      loading.value = false;
    }
  }

  const createApartment = (name: string) =>
    adopt(() => api.post<Apartment>(ROOT, { name }));
  const duplicateApartment = (name: string) =>
    adopt(() => api.post<Apartment>(`${base()}/duplicate`, { name }));

  async function renameApartment(name: string): Promise<boolean> {
    const ok = await write(() =>
      api.put<Apartment>(`${base()}/name`, { name }),
    );
    if (ok) await fetchApartments();
    return ok;
  }

  /** Delete or leave: the server answers with where the caller can go next. */
  async function depart(
    call: () => Promise<ApartmentSummary[]>,
  ): Promise<string | null> {
    loading.value = true;
    try {
      apartments.value = await call();
      resetDraft();
      error.value = null;
      return apartments.value[0]?.id ?? null;
    } catch (e) {
      error.value = message(e);
      return null;
    } finally {
      loading.value = false;
    }
  }

  const deleteApartment = () =>
    depart(() => api.del<ApartmentSummary[]>(base()));

  const addPieces = (pieces: PieceDraft[]) =>
    write(() => api.post<Apartment>(`${base()}/furniture`, { pieces }));
  const updatePiece = (id: string, piece: PieceDraft) =>
    write(() =>
      api.put<Apartment>(`${base()}/furniture/${encodeURIComponent(id)}`, {
        ...piece,
      }),
    );
  const deletePiece = (id: string) =>
    write(() =>
      api.del<Apartment>(`${base()}/furniture/${encodeURIComponent(id)}`),
    );

  const layoutPath = (id: string) =>
    `${base()}/layouts/${encodeURIComponent(id)}`;

  const createLayout = (name: string) =>
    write(() => api.post<Apartment>(`${base()}/layouts`, { name }));
  const renameLayout = (id: string, name: string) =>
    write(() => api.put<Apartment>(layoutPath(id), { name }));
  const duplicateLayout = (id: string) =>
    write(() => api.post<Apartment>(`${layoutPath(id)}/duplicate`));
  const deleteLayout = (id: string) =>
    write(() => api.del<Apartment>(layoutPath(id)));

  /** The first free "Layout A".."Layout Z", so a new tab never repeats a name. */
  function nextLayoutName(): string {
    const taken = new Set((apartment.value?.layouts ?? []).map((l) => l.name));
    for (let i = 0; i < 26; i++) {
      const name = `Layout ${String.fromCharCode(65 + i)}`;
      if (!taken.has(name)) return name;
    }
    return `Layout ${taken.size + 1}`;
  }

  /** Applies a placement change locally before the request, so a moved piece never jumps back. */
  function editPlacements(
    layoutId: string,
    change: (placements: Placement[]) => Placement[],
  ): void {
    const layout = apartment.value?.layouts.find((l) => l.id === layoutId);
    if (layout) layout.placements = change(layout.placements);
  }

  function placePiece(
    layoutId: string,
    furnitureId: string,
    at: Pick<Placement, "x_cm" | "y_cm" | "rotation">,
  ): Promise<boolean> {
    editPlacements(layoutId, (ps) => [
      ...ps.filter((p) => p.furniture_id !== furnitureId),
      { furniture_id: furnitureId, ...at },
    ]);
    return write(() =>
      api.put<Apartment>(
        `${layoutPath(layoutId)}/placements/${encodeURIComponent(furnitureId)}`,
        { ...at },
      ),
    );
  }

  function removePlacement(
    layoutId: string,
    furnitureId: string,
  ): Promise<boolean> {
    editPlacements(layoutId, (ps) =>
      ps.filter((p) => p.furniture_id !== furnitureId),
    );
    return write(() =>
      api.del<Apartment>(
        `${layoutPath(layoutId)}/placements/${encodeURIComponent(furnitureId)}`,
      ),
    );
  }

  /** How many layouts place the piece, for the delete confirmation. */
  function placedIn(id: string): number {
    return (apartment.value?.layouts ?? []).filter((l) =>
      l.placements.some((p) => p.furniture_id === id),
    ).length;
  }

  const leave = () =>
    depart(() => api.post<ApartmentSummary[]>(`${base()}/leave`));

  /** The dock roster for the add field; a failure yields an empty list. */
  async function fetchRoster(): Promise<string[]> {
    try {
      return (await api.get<{ usernames: string[] }>("/auth/users")).usernames;
    } catch (e) {
      error.value = message(e);
      return [];
    }
  }

  function dismissNotice(): void {
    notice.value = null;
    planConflict.value = false;
  }

  function scheduleAutosave(): void {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = null;
    if (!dirty.value || planConflict.value) return;
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null;
      void savePlan();
    }, AUTOSAVE_MS);
  }

  function step(change: (present: PlanGrid) => PlanGrid): void {
    let start = draft.value;
    if (!start && apartment.value) {
      start = hist.createHistory(planOf(apartment.value));
      savedPlan.value = start.present;
      draftPlanRev = apartment.value.plan_rev;
    }
    if (!start) return;
    const next = change(start.present);
    if (next === start.present) return;
    draft.value = hist.push(start, next);
    scheduleAutosave();
  }

  /** One call per stroke or rectangle, so each is one undo step. */
  const applyStroke = (cells: Cell[], brush: Brush) =>
    step((p) => paint(p, cells, brush));
  const resizePlan = (cols: number, rows: number) =>
    step((p) => resize(p, cols, rows));
  const addLabel = (text: string, cell: Cell) =>
    step((p) => ({
      ...p,
      labels: [
        ...p.labels,
        { id: `lb_${crypto.randomUUID()}`, text: text.trim(), ...cell },
      ],
    }));
  const editLabels = (fn: (labels: Label[]) => Label[]) =>
    step((p) => ({ ...p, labels: fn(p.labels) }));
  const moveLabel = (id: string, cell: Cell) =>
    editLabels((ls) => ls.map((l) => (l.id === id ? { ...l, ...cell } : l)));
  const renameLabel = (id: string, text: string) =>
    editLabels((ls) =>
      ls.map((l) => (l.id === id ? { ...l, text: text.trim() } : l)),
    );
  const deleteLabel = (id: string) =>
    editLabels((ls) => ls.filter((l) => l.id !== id));

  function undo(): void {
    if (!draft.value) return;
    draft.value = hist.undo(draft.value);
    scheduleAutosave();
  }

  function redo(): void {
    if (!draft.value) return;
    draft.value = hist.redo(draft.value);
    scheduleAutosave();
  }

  function discardDraft(): void {
    resetDraft();
    dismissNotice();
  }

  /** One save at a time: a second one would be refused against the first's new plan_rev. */
  async function savePlan(): Promise<boolean> {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = null;
    while (inflight) await inflight;
    if (!dirty.value) return true;
    inflight = sendPlan();
    try {
      return await inflight;
    } finally {
      inflight = null;
    }
  }

  /** A lost race keeps the drawing and pauses autosave: Save again overwrites, Discard shows theirs. */
  async function sendPlan(): Promise<boolean> {
    if (!draft.value) return true;
    const sent = draft.value.present;
    const { cols, rows, surface, feature, labels } = sent;
    saving.value = true;
    try {
      const result = await api.put<Apartment>(`${base()}/plan`, {
        ...baseRev(),
        cols,
        rows,
        surface,
        feature,
        labels,
      });
      savedPlan.value = sent;
      draftPlanRev = result.plan_rev;
      apartment.value = result;
      error.value = null;
      dismissNotice();
      // Strokes drawn while the save was in flight still need saving.
      scheduleAutosave();
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const who = e.detail.replace(/ changed this$/, "");
        notice.value = `${who} changed the plan. Save again to replace it with yours, or Discard to see theirs.`;
        planConflict.value = true;
        error.value = null;
        await refetchQuietly();
      } else {
        error.value = message(e);
      }
      return false;
    } finally {
      saving.value = false;
    }
  }

  /** Saves any pending drawing now; false if that failed or a conflict awaits the user's call. */
  async function flush(): Promise<boolean> {
    if (planConflict.value) return false;
    return dirty.value ? savePlan() : true;
  }

  async function lockWithSave(): Promise<boolean> {
    if (dirty.value && !(await savePlan())) return false;
    return lock();
  }

  return {
    apartments,
    apartment,
    loading,
    saving,
    saveState,
    error,
    notice,
    planConflict,
    plan,
    dirty,
    canUndo,
    canRedo,
    fetchApartments,
    openApartment,
    createApartment,
    duplicateApartment,
    renameApartment,
    deleteApartment,
    flush,
    lock,
    unlock,
    lockWithSave,
    addMember,
    removeMember,
    addPieces,
    updatePiece,
    deletePiece,
    placedIn,
    createLayout,
    renameLayout,
    duplicateLayout,
    deleteLayout,
    nextLayoutName,
    placePiece,
    removePlacement,
    leave,
    fetchRoster,
    dismissNotice,
    applyStroke,
    resizePlan,
    addLabel,
    moveLabel,
    renameLabel,
    deleteLabel,
    undo,
    redo,
    discardDraft,
    savePlan,
  };
});
