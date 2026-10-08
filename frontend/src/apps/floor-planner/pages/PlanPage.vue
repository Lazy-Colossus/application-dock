<template>
  <q-page
    ref="root"
    class="fp floor-planner-app"
    :style-fn="fitWindow"
    tabindex="-1"
    @keydown="onKey"
  >
    <div class="fp__top">
      <ApartmentMenu
        :apartments="store.apartments"
        :current="store.apartment"
        @show="store.fetchApartments()"
        @open="goTo"
        @create="apartmentDialog = 'create'"
        @duplicate="apartmentDialog = 'duplicate'"
        @rename="apartmentDialog = 'rename'"
        @remove="deleteApartment"
      />
      <div class="fp__modes" role="tablist" aria-label="Mode">
        <button
          v-for="m in modes"
          :key="m.id"
          type="button"
          role="tab"
          class="fp__mode"
          :class="{ 'fp__mode--active': mode === m.id }"
          :aria-selected="mode === m.id"
          :data-testid="`mode-${m.id}`"
          @click="mode = m.id"
        >
          {{ m.label }}
        </button>
      </div>
      <div class="fp__spacer" />
      <template v-if="store.apartment">
        <span
          class="fp__chip"
          :class="
            store.apartment.locked ? 'fp__chip--locked' : 'fp__chip--unlocked'
          "
          data-testid="lock-chip"
        >
          {{ store.apartment.locked ? "Plan locked" : "Unlocked" }}
        </span>
        <button
          type="button"
          class="fp-button"
          data-testid="lock-toggle"
          :disabled="store.loading"
          @click="
            store.apartment.locked ? store.unlock() : store.lockWithSave()
          "
        >
          {{ store.apartment.locked ? "Unlock" : "Lock plan" }}
        </button>
        <button
          type="button"
          class="fp__people"
          aria-label="People sharing this apartment"
          data-testid="members-open"
          @click="membersOpen = true"
        >
          <span
            v-for="member in store.apartment.members"
            :key="member"
            class="fp__avatar"
            :title="member"
          >
            {{ member.charAt(0).toUpperCase() }}
          </span>
        </button>
      </template>
    </div>

    <div
      v-if="store.notice"
      class="fp__notice"
      role="status"
      data-testid="fp-notice"
    >
      <span>{{ store.notice }}</span>
      <span class="fp__notice-actions">
        <button
          v-if="store.planConflict"
          type="button"
          class="fp-button"
          data-testid="conflict-discard"
          @click="store.discardDraft()"
        >
          Discard
        </button>
        <button type="button" class="fp-button" @click="store.dismissNotice()">
          OK
        </button>
      </span>
    </div>
    <p
      v-if="store.error && !membersOpen"
      class="fp__error"
      data-testid="fp-error"
    >
      {{ store.error }}
    </p>

    <div class="fp__body">
      <aside class="fp__panel fp__panel--left" data-testid="fp-left">
        <DrawPanel
          v-if="mode === 'draw'"
          v-model:brush="brush"
          v-model:shape="shape"
          v-model:size="brushSize"
          :can-undo="store.canUndo"
          :can-redo="store.canRedo"
          :locked="locked"
          @undo="store.undo()"
          @redo="store.redo()"
        />
        <FurnitureList
          v-else-if="mode === 'furniture'"
          :pieces="store.apartment?.furniture ?? []"
          :selected-id="selectedId"
          @select="selectPiece"
          @add="startAdding"
          @bulk="bulkOpen = true"
        />
        <LayoutTray
          v-else
          :pieces="trayPieces"
          :placed="placedPieces"
          :layout-name="activeLayout?.name ?? ''"
          :selected-id="selectedPlacedId"
          :locked="locked"
          @select="selectedPlacedId = $event"
          @lock="store.lockWithSave()"
        />
      </aside>
      <section class="fp__plan" data-testid="fp-plan">
        <div class="fp__sheet">
          <PlanCanvas
            v-if="store.plan"
            :plan="store.plan"
            :zoom="zoom"
            :editable="drawing"
            :brush="drawing ? brush : null"
            :shape="shape"
            :brush-size="brushSize"
            @stroke="(cells) => store.applyStroke(cells, brush)"
            @hover="hover = $event"
            @preview="readout = $event"
            @label-at="newLabel"
            @label-pick="editLabel"
            @label-move="store.moveLabel"
            :placed="mode === 'arrange' ? placed : []"
            :selected-id="selectedPlacedId"
            :arranging="arranging"
            :droppable="arranging"
            @select="selectedPlacedId = $event"
            @move="movePiece"
            @drop="dropPiece"
          />
        </div>
      </section>
      <aside class="fp__panel fp__panel--right" data-testid="fp-right">
        <PlanInfoPanel
          v-if="mode === 'draw' && store.plan"
          :plan="store.plan"
          :locked="locked"
          @resize="store.resizePlan"
          @rename="editLabel"
          @remove="store.deleteLabel"
        />
        <template v-else-if="mode === 'furniture'">
          <PieceForm
            v-if="adding || selectedPiece"
            :key="selectedPiece?.id ?? 'new'"
            :piece="selectedPiece"
            :placed-in="selectedPiece ? store.placedIn(selectedPiece.id) : 0"
            @save="savePiece"
            @remove="removePiece"
            @cancel="closeForm"
          />
          <p v-else class="fp__hint" data-testid="piece-hint">
            Select a piece to edit it, or add one.
          </p>
        </template>
        <template v-else>
          <PlacementInspector
            v-if="selectedPlaced"
            :piece="selectedPlaced.piece"
            :placement="selectedPlaced.placement"
            :warnings="selectedWarnings"
            @rotate="rotateSelected"
            @back="backToTray"
          />
          <template v-else>
            <p class="fp__hint" data-testid="arrange-hint">
              Select a piece on the plan, or drag one from the tray.
            </p>
            <div class="fp__scale-card">
              <span class="fp-mono">1 square = 20 cm</span>
              <span>Pieces snap to 10 cm.</span>
            </div>
          </template>
        </template>
      </aside>
    </div>

    <StatusBar
      v-model:zoom="zoom"
      :hover="hover"
      :readout="readout"
      :save-state="store.saveState"
      @save="store.savePlan()"
    >
      <LayoutTabs
        v-if="mode === 'arrange' && store.apartment"
        :layouts="store.apartment.layouts"
        :active-id="activeLayout?.id ?? null"
        @select="switchLayout"
        @create="createLayout"
        @duplicate="duplicateLayout"
        @rename="layoutRenaming = true"
        @remove="deleteLayout"
      />
    </StatusBar>

    <q-dialog
      :model-value="labelEdit !== null"
      @update:model-value="labelEdit = null"
    >
      <NameDialog
        v-if="labelEdit"
        :initial="labelEdit.text"
        :title="labelEdit.id ? 'Room label' : 'New room label'"
        placeholder="e.g. Living room"
        :can-delete="labelEdit.id !== null"
        @save="saveLabel"
        @remove="removeLabel"
        @cancel="labelEdit = null"
      />
    </q-dialog>

    <q-dialog v-model="layoutRenaming">
      <NameDialog
        v-if="layoutRenaming && activeLayout"
        title="Rename layout"
        :initial="activeLayout.name"
        placeholder="e.g. Sofa by the window"
        :can-delete="false"
        @save="renameLayout"
        @cancel="layoutRenaming = false"
      />
    </q-dialog>

    <q-dialog v-model="bulkOpen">
      <BulkAddDialog
        v-if="bulkOpen"
        @add="addBulk"
        @cancel="bulkOpen = false"
      />
    </q-dialog>

    <q-dialog v-model="membersOpen">
      <MembersDialog
        v-if="membersOpen"
        @close="membersOpen = false"
        @left="afterLeaving"
      />
    </q-dialog>

    <q-dialog
      :model-value="apartmentDialog !== null"
      @update:model-value="apartmentDialog = null"
    >
      <NameDialog
        v-if="apartmentDialog"
        :title="APARTMENT_DIALOG[apartmentDialog]"
        :initial="apartmentDialogInitial"
        placeholder="e.g. Flat on Elm Street"
        :can-delete="false"
        :max-length="60"
        @save="saveApartmentName"
        @cancel="apartmentDialog = null"
      />
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type ComponentPublicInstance,
} from "vue";
import {
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  useRoute,
  useRouter,
} from "vue-router";
import ApartmentMenu from "../components/ApartmentMenu.vue";
import BulkAddDialog from "../components/BulkAddDialog.vue";
import DrawPanel from "../components/DrawPanel.vue";
import FurnitureList from "../components/FurnitureList.vue";
import LayoutTabs from "../components/LayoutTabs.vue";
import LayoutTray from "../components/LayoutTray.vue";
import PlacementInspector from "../components/PlacementInspector.vue";
import PieceForm from "../components/PieceForm.vue";
import MembersDialog from "../components/MembersDialog.vue";
import NameDialog from "../components/NameDialog.vue";
import PlanCanvas from "../components/PlanCanvas.vue";
import PlanInfoPanel from "../components/PlanInfoPanel.vue";
import StatusBar from "../components/StatusBar.vue";
import { DEFAULT_BRUSH, type Brush } from "../codes";
import type { PieceDraft } from "../furniture";
import {
  topLeftForCentre,
  warningText,
  warnings,
  type Placed,
} from "../geometry";
import type { BrushSize, Cell } from "../grid";
import { useFloorPlanStore } from "../stores/useFloorPlanStore";
import type { Mode, Rotation } from "../types";
import "../css/floor-planner.sass";

const modes: { id: Mode; label: string }[] = [
  { id: "draw", label: "Draw plan" },
  { id: "furniture", label: "Furniture" },
  { id: "arrange", label: "Arrange" },
];

const store = useFloorPlanStore();
const route = useRoute();
const router = useRouter();
const mode = ref<Mode>("draw");
const membersOpen = ref(false);
const brush = ref<Brush>(DEFAULT_BRUSH);
const shape = ref<"freehand" | "rectangle">("rectangle");
const brushSize = ref<BrushSize>(1);
const zoom = ref(1);
const hover = ref<Cell | null>(null);
const readout = ref<string | null>(null);
const labelEdit = ref<{ id: string | null; cell: Cell; text: string } | null>(
  null,
);
const root = ref<ComponentPublicInstance | null>(null);

const selectedId = ref<string | null>(null);
const adding = ref(false);
const bulkOpen = ref(false);

const locked = computed(() => store.apartment?.locked ?? false);
const selectedPiece = computed(
  () =>
    store.apartment?.furniture.find((p) => p.id === selectedId.value) ?? null,
);

const activeLayoutId = ref<string | null>(null);
const selectedPlacedId = ref<string | null>(null);
const layoutRenaming = ref(false);

const arranging = computed(() => mode.value === "arrange" && locked.value);
/** Falls back to the first layout if the chosen one was deleted, here or elsewhere. */
const activeLayout = computed(() => {
  const layouts = store.apartment?.layouts ?? [];
  return (
    layouts.find((l) => l.id === activeLayoutId.value) ?? layouts[0] ?? null
  );
});
const furnitureById = computed(
  () => new Map((store.apartment?.furniture ?? []).map((p) => [p.id, p])),
);
const placedRaw = computed<Placed[]>(() =>
  (activeLayout.value?.placements ?? []).flatMap((placement) => {
    const piece = furnitureById.value.get(placement.furniture_id);
    return piece ? [{ piece, placement }] : [];
  }),
);
const placed = computed(() =>
  placedRaw.value.map((p) => ({
    ...p,
    warned: store.plan
      ? warnings(p, store.plan, placedRaw.value).length > 0
      : false,
  })),
);
const placedIds = computed(
  () => new Set(placedRaw.value.map((p) => p.piece.id)),
);
const trayPieces = computed(() =>
  (store.apartment?.furniture ?? []).filter((p) => !placedIds.value.has(p.id)),
);
const placedPieces = computed(() => placedRaw.value.map((p) => p.piece));
const selectedPlaced = computed(
  () =>
    placedRaw.value.find((p) => p.piece.id === selectedPlacedId.value) ?? null,
);
const selectedWarnings = computed(() =>
  selectedPlaced.value && store.plan
    ? warnings(selectedPlaced.value, store.plan, placedRaw.value).map(
        warningText,
      )
    : [],
);

watch([mode, () => activeLayout.value?.id], () => {
  selectedPlacedId.value = null;
});

function dropPiece(id: string, cx: number, cy: number): void {
  const piece = furnitureById.value.get(id);
  if (!piece || !activeLayout.value) return;
  const { x, y } = topLeftForCentre(piece, cx, cy);
  store.placePiece(activeLayout.value.id, id, {
    x_cm: x,
    y_cm: y,
    rotation: 0,
  });
  selectedPlacedId.value = id;
}

function movePiece(id: string, x: number, y: number): void {
  const current = placedRaw.value.find((p) => p.piece.id === id);
  if (!current || !activeLayout.value) return;
  store.placePiece(activeLayout.value.id, id, {
    x_cm: x,
    y_cm: y,
    rotation: current.placement.rotation,
  });
}

function rotateSelected(delta: -90 | 90): void {
  const sel = selectedPlaced.value;
  if (!sel || !activeLayout.value) return;
  const rotation = ((sel.placement.rotation + delta + 360) % 360) as Rotation;
  store.placePiece(activeLayout.value.id, sel.piece.id, {
    ...sel.placement,
    rotation,
  });
}

function backToTray(): void {
  const sel = selectedPlaced.value;
  if (!sel || !activeLayout.value) return;
  store.removePlacement(activeLayout.value.id, sel.piece.id);
  selectedPlacedId.value = null;
}

function switchLayout(id: string): void {
  activeLayoutId.value = id;
}

/** A created or duplicated layout is the last one in the returned list. */
function showNewest(): void {
  const layouts = store.apartment?.layouts ?? [];
  activeLayoutId.value = layouts[layouts.length - 1]?.id ?? null;
}

async function createLayout(): Promise<void> {
  if (await store.createLayout(store.nextLayoutName())) showNewest();
}

async function duplicateLayout(): Promise<void> {
  if (
    activeLayout.value &&
    (await store.duplicateLayout(activeLayout.value.id))
  ) {
    showNewest();
  }
}

async function renameLayout(name: string): Promise<void> {
  if (activeLayout.value) await store.renameLayout(activeLayout.value.id, name);
  layoutRenaming.value = false;
}

async function deleteLayout(): Promise<void> {
  const layout = activeLayout.value;
  if (
    layout &&
    window.confirm(
      `Delete ${layout.name}? Its arrangement is lost; the furniture stays.`,
    ) &&
    (await store.deleteLayout(layout.id))
  ) {
    activeLayoutId.value = null;
  }
}

function selectPiece(id: string): void {
  selectedId.value = id;
  adding.value = false;
}

function startAdding(): void {
  selectedId.value = null;
  adding.value = true;
}

function closeForm(): void {
  selectedId.value = null;
  adding.value = false;
}

/** After an add, the newest piece is the last one in the returned list. */
function selectNewest(): void {
  const pieces = store.apartment?.furniture ?? [];
  selectPiece(pieces[pieces.length - 1]?.id ?? "");
}

async function savePiece(draft: PieceDraft): Promise<void> {
  if (selectedId.value) {
    await store.updatePiece(selectedId.value, draft);
  } else if (await store.addPieces([draft])) {
    selectNewest();
  }
}

async function removePiece(): Promise<void> {
  if (selectedId.value && (await store.deletePiece(selectedId.value)))
    closeForm();
}

async function addBulk(pieces: PieceDraft[]): Promise<void> {
  if (await store.addPieces(pieces)) bulkOpen.value = false;
}
type ApartmentDialog = "create" | "duplicate" | "rename";
const APARTMENT_DIALOG: Record<ApartmentDialog, string> = {
  create: "New apartment",
  duplicate: "Duplicate apartment",
  rename: "Rename apartment",
};
const apartmentDialog = ref<ApartmentDialog | null>(null);
const apartmentDialogInitial = computed(() => {
  const name = store.apartment?.name ?? "";
  if (apartmentDialog.value === "create") return "New apartment";
  return apartmentDialog.value === "duplicate" ? `${name} copy` : name;
});

const routeId = computed(() => {
  const id = route.params.apartmentId;
  return typeof id === "string" && id ? id : null;
});

function goTo(id: string, replace = false): void {
  const to = { name: "floor-planner", params: { apartmentId: id } };
  void (replace ? router.replace(to) : router.push(to));
}

function resetSelection(): void {
  selectedId.value = null;
  adding.value = false;
  activeLayoutId.value = null;
  selectedPlacedId.value = null;
  labelEdit.value = null;
}

watch(routeId, (id) => {
  if (!id || id === store.apartment?.id) return;
  resetSelection();
  store.openApartment(id);
});

/** No id, or one that isn't ours any more: go to the most recently changed apartment. */
async function openFromRoute(): Promise<void> {
  const list = await store.fetchApartments();
  const id = routeId.value;
  if (id && list.some((a) => a.id === id)) await store.openApartment(id);
  else if (list[0]) goTo(list[0].id, true);
}

async function saveApartmentName(name: string): Promise<void> {
  const kind = apartmentDialog.value;
  apartmentDialog.value = null;
  if (kind === "rename") {
    await store.renameApartment(name);
    return;
  }
  const id = await (kind === "create"
    ? store.createApartment(name)
    : store.duplicateApartment(name));
  if (id) {
    resetSelection();
    goTo(id);
  }
}

async function deleteApartment(): Promise<void> {
  const name = store.apartment?.name ?? "this apartment";
  if (
    !window.confirm(
      `Delete "${name}"? Its plan, furniture and layouts are gone for everyone who shares it.`,
    )
  ) {
    return;
  }
  const next = await store.deleteApartment();
  if (next) goTo(next, true);
}

function afterLeaving(nextId: string): void {
  membersOpen.value = false;
  goTo(nextId, true);
}

const drawing = computed(() => mode.value === "draw" && !locked.value);

/** Exactly the window below the shell bar, so the status bar never scrolls out of view. */
function fitWindow(offset: number, height: number): Record<string, string> {
  return { height: `${height - offset}px` };
}

function newLabel(cell: Cell): void {
  labelEdit.value = { id: null, cell, text: "" };
}

function editLabel(id: string): void {
  const label = store.plan?.labels.find((l) => l.id === id);
  if (label) labelEdit.value = { id, cell: label, text: label.text };
}

function saveLabel(text: string): void {
  const edit = labelEdit.value;
  if (!edit) return;
  if (edit.id) store.renameLabel(edit.id, text);
  else store.addLabel(text, { col: edit.cell.col, row: edit.cell.row });
  labelEdit.value = null;
}

function removeLabel(): void {
  if (labelEdit.value?.id) store.deleteLabel(labelEdit.value.id);
  labelEdit.value = null;
}

function onKey(e: KeyboardEvent): void {
  const target = e.target as HTMLElement | null;
  if (target?.closest("input, textarea")) return;
  if (arranging.value) {
    if (e.key === "Escape") selectedPlacedId.value = null;
    else if (e.key.toLowerCase() === "r" && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      rotateSelected(e.shiftKey ? -90 : 90);
    }
    return;
  }
  if (
    !drawing.value ||
    !(e.metaKey || e.ctrlKey) ||
    e.key.toLowerCase() !== "z"
  ) {
    return;
  }
  e.preventDefault();
  if (e.shiftKey) store.redo();
  else store.undo();
}

function warnBeforeUnload(e: BeforeUnloadEvent): void {
  e.preventDefault();
}

watch(
  () => store.dirty,
  (dirty) => {
    if (dirty) window.addEventListener("beforeunload", warnBeforeUnload);
    else window.removeEventListener("beforeunload", warnBeforeUnload);
  },
);

/** Saves the drawing before going anywhere; asks only if that fails. */
async function saveBeforeLeaving(): Promise<boolean> {
  if (await store.flush()) return true;
  return window.confirm(
    "Leave without saving? Your drawing since the last save will be lost.",
  );
}

onBeforeRouteLeave(saveBeforeLeaving);
onBeforeRouteUpdate(saveBeforeLeaving);

onMounted(() => {
  (root.value?.$el as HTMLElement | undefined)?.focus?.();
  void openFromRoute();
});

onBeforeUnmount(() =>
  window.removeEventListener("beforeunload", warnBeforeUnload),
);
</script>

<style scoped lang="scss">
.fp {
  display: flex;
  flex-direction: column;
  background: var(--fp-ground);
  outline: none;
}
.fp__scale-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 16px;
  padding: 12px;
  border: 1px solid var(--fp-line);
  border-radius: 8px;
  background: var(--fp-chrome);
  font-size: 12px;
  color: var(--fp-muted);
}
.fp__scale-card .fp-mono {
  font-size: 14px;
  color: var(--fp-ink);
}
.fp__hint {
  margin: 0;
  font-size: 13px;
  color: var(--fp-muted);
}
.fp__notice-actions {
  display: flex;
  gap: 8px;
}
.fp__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 8px 16px;
  box-sizing: border-box;
  background: var(--fp-chrome);
  border-bottom: 1px solid var(--fp-line);
}
.fp__modes {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 8px;
  background: #f1efea;
}
.fp__mode {
  height: 36px;
  padding: 0 16px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #3d3b36;
  font: 500 13px/1 var(--fp-sans);
  cursor: pointer;
}
.fp__mode--active {
  background: var(--fp-accent);
  color: #ffffff;
  font-weight: 600;
}
.fp__spacer {
  flex: 1;
}
.fp__chip {
  padding: 4px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
}
.fp__chip--locked {
  background: var(--fp-locked-bg);
  color: var(--fp-locked-ink);
}
.fp__chip--unlocked {
  background: var(--fp-unlocked-bg);
  color: var(--fp-unlocked-ink);
}
.fp__people {
  display: flex;
  min-height: 44px;
  align-items: center;
  padding: 0 4px;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.fp__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 2px solid var(--fp-chrome);
  border-radius: 50%;
  background: var(--fp-accent);
  color: #ffffff;
  font: 600 13px/1 var(--fp-sans);
}
.fp__avatar + .fp__avatar {
  margin-left: -6px;
  background: #0f766e;
}
.fp__notice,
.fp__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0;
  padding: 8px 16px;
  font-size: 13px;
}
.fp__notice {
  background: #e8eefc;
  color: #1e3a8a;
}
.fp__error {
  background: var(--fp-warn-bg);
  color: var(--fp-warn-ink);
}
// No wrapping: the screen is laptop-first, and a wrapped row would size to its
// content and push the panels under the status bar instead of scrolling them.
.fp__body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.fp__panel {
  flex: 0 1 252px;
  min-width: 220px;
  padding: 16px;
  box-sizing: border-box;
  overflow-y: auto;
  background: var(--fp-panel);
}
.fp__panel--left {
  border-right: 1px solid var(--fp-line);
}
.fp__panel--right {
  flex-basis: 268px;
  border-left: 1px solid var(--fp-line);
}
.fp__plan {
  flex: 999 1 560px;
  min-width: 0;
  display: flex;
  overflow: auto;
  padding: 32px;
  box-sizing: border-box;
}
// margin: auto centres the sheet but, unlike justify-content, never clips it
// when the zoomed plan is wider than the column.
.fp__sheet {
  margin: auto;
}
</style>
