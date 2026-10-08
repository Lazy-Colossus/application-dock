import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { api, ApiError } from "@/composables/useApi";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Brush } from "../codes";
import type { PieceDraft } from "../furniture";
import { paint, resize, type Cell, type PlanGrid } from "../grid";
import * as hist from "../history";
import type { Apartment, Label, Placement } from "../types";

const BASE = "/floor-planner/apartment";

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
  const apartment = ref<Apartment | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  /** Someone else's write won; the view was reloaded. Not an error. */
  const notice = ref<string | null>(null);
  /** True while `notice` is a plan-save conflict that still holds the local drawing. */
  const planConflict = ref(false);
  /** Painting happens here and reaches the server only on Save (or Lock). */
  const draft = ref<hist.History<PlanGrid> | null>(null);

  const dirty = computed(() =>
    draft.value ? hist.canUndo(draft.value) : false,
  );
  const canUndo = dirty;
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

  async function fetchApartment(): Promise<void> {
    loading.value = true;
    try {
      apartment.value = await api.get<Apartment>(BASE);
      error.value = null;
    } catch (e) {
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  async function refetchQuietly(): Promise<void> {
    try {
      apartment.value = await api.get<Apartment>(BASE);
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
    write(() => api.post<Apartment>(`${BASE}/lock`, baseRev()));
  const unlock = () =>
    write(() => api.post<Apartment>(`${BASE}/unlock`, baseRev()));
  const addMember = (username: string) =>
    write(() => api.post<Apartment>(`${BASE}/members`, { username }));
  const removeMember = (username: string) =>
    write(() =>
      api.del<Apartment>(`${BASE}/members/${encodeURIComponent(username)}`),
    );

  const addPieces = (pieces: PieceDraft[]) =>
    write(() => api.post<Apartment>(`${BASE}/furniture`, { pieces }));
  const updatePiece = (id: string, piece: PieceDraft) =>
    write(() =>
      api.put<Apartment>(`${BASE}/furniture/${encodeURIComponent(id)}`, {
        ...piece,
      }),
    );
  const deletePiece = (id: string) =>
    write(() =>
      api.del<Apartment>(`${BASE}/furniture/${encodeURIComponent(id)}`),
    );

  const layoutPath = (id: string) =>
    `${BASE}/layouts/${encodeURIComponent(id)}`;

  const createLayout = (name: string) =>
    write(() => api.post<Apartment>(`${BASE}/layouts`, { name }));
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

  async function leave(): Promise<boolean> {
    const me = useAuthStore().username;
    return me ? removeMember(me) : false;
  }

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

  function step(change: (present: PlanGrid) => PlanGrid): void {
    const start =
      draft.value ??
      (apartment.value ? hist.createHistory(planOf(apartment.value)) : null);
    if (!start) return;
    const next = change(start.present);
    if (next !== start.present) draft.value = hist.push(start, next);
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
    if (draft.value) draft.value = hist.undo(draft.value);
  }

  function redo(): void {
    if (draft.value) draft.value = hist.redo(draft.value);
  }

  function discardDraft(): void {
    draft.value = null;
    dismissNotice();
  }

  /** A lost race keeps the drawing: Save again overwrites, Discard shows theirs. */
  async function savePlan(): Promise<boolean> {
    if (!draft.value) return true;
    const { cols, rows, surface, feature, labels } = draft.value.present;
    loading.value = true;
    try {
      apartment.value = await api.put<Apartment>(`${BASE}/plan`, {
        ...baseRev(),
        cols,
        rows,
        surface,
        feature,
        labels,
      });
      draft.value = null;
      error.value = null;
      dismissNotice();
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
      loading.value = false;
    }
  }

  async function lockWithSave(): Promise<boolean> {
    if (dirty.value && !(await savePlan())) return false;
    return lock();
  }

  return {
    apartment,
    loading,
    error,
    notice,
    planConflict,
    plan,
    dirty,
    canUndo,
    canRedo,
    fetchApartment,
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
