<template>
  <q-page
    ref="root"
    class="fp floor-planner-app"
    :style-fn="fitWindow"
    tabindex="-1"
    @keydown="onKey"
  >
    <div class="fp__top">
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
            @stroke="(cells) => store.applyStroke(cells, brush)"
            @hover="hover = $event"
            @preview="readout = $event"
            @label-at="newLabel"
            @label-pick="editLabel"
            @label-move="store.moveLabel"
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
      </aside>
    </div>

    <StatusBar
      v-model:zoom="zoom"
      :hover="hover"
      :readout="readout"
      :dirty="store.dirty"
      :saving="store.loading"
      @save="store.savePlan()"
      @discard="discard"
    />

    <q-dialog
      :model-value="labelEdit !== null"
      @update:model-value="labelEdit = null"
    >
      <LabelDialog
        v-if="labelEdit"
        :initial="labelEdit.text"
        :editing="labelEdit.id !== null"
        @save="saveLabel"
        @remove="removeLabel"
        @cancel="labelEdit = null"
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
        @left="membersOpen = false"
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
import { onBeforeRouteLeave } from "vue-router";
import BulkAddDialog from "../components/BulkAddDialog.vue";
import DrawPanel from "../components/DrawPanel.vue";
import FurnitureList from "../components/FurnitureList.vue";
import PieceForm from "../components/PieceForm.vue";
import LabelDialog from "../components/LabelDialog.vue";
import MembersDialog from "../components/MembersDialog.vue";
import PlanCanvas from "../components/PlanCanvas.vue";
import PlanInfoPanel from "../components/PlanInfoPanel.vue";
import StatusBar from "../components/StatusBar.vue";
import { DEFAULT_BRUSH, type Brush } from "../codes";
import type { PieceDraft } from "../furniture";
import type { Cell } from "../grid";
import { useFloorPlanStore } from "../stores/useFloorPlanStore";
import type { Mode } from "../types";
import "../css/floor-planner.sass";

const modes: { id: Mode; label: string }[] = [
  { id: "draw", label: "Draw plan" },
  { id: "furniture", label: "Furniture" },
  { id: "arrange", label: "Arrange" },
];

const store = useFloorPlanStore();
const mode = ref<Mode>("draw");
const membersOpen = ref(false);
const brush = ref<Brush>(DEFAULT_BRUSH);
const shape = ref<"freehand" | "rectangle">("rectangle");
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

function discard(): void {
  if (window.confirm("Discard your drawing since the last save?")) {
    store.discardDraft();
  }
}

function onKey(e: KeyboardEvent): void {
  const target = e.target as HTMLElement | null;
  if (target?.closest("input, textarea")) return;
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

onBeforeRouteLeave(() => {
  if (!store.dirty) return true;
  return window.confirm(
    "Leave without saving? Your drawing since the last save will be lost.",
  );
});

onMounted(() => {
  (root.value?.$el as HTMLElement | undefined)?.focus?.();
  store.fetchApartment();
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
