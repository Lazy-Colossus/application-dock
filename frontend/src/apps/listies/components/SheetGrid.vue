<template>
  <div class="sheet-grid">
    <div
      class="sheet-grid__scroll"
      data-testid="grid-body"
      @keydown="onKeydown"
    >
      <table class="sheet-grid__table">
        <thead>
          <tr>
            <th
              v-for="column in orderedColumns"
              :key="column.id"
              class="sheet-grid__header"
              :class="{
                'sheet-grid__header--number': column.type === 'number',
              }"
              :data-testid="`header-${column.id}`"
            >
              <span class="sheet-grid__glyph">{{
                typeGlyph(column.type)
              }}</span>
              <span
                class="sheet-grid__header-name"
                :data-testid="`header-name-${column.id}`"
                >{{ column.name }}</span
              >
            </th>
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="(row, rowIndex) in orderedRows"
            :key="row.id"
            class="sheet-grid__row"
            :class="{ 'sheet-grid__row--striped': rowIndex % 2 === 1 }"
            :data-testid="`row-${row.id}`"
          >
            <GridCell
              v-for="(column, columnIndex) in orderedColumns"
              :key="column.id"
              :ref="(el) => registerCell(rowIndex, columnIndex, el)"
              editable
              :value="row.cells[column.id] ?? null"
              :column="column"
              :focused="nav.isFocused(rowIndex, columnIndex)"
              :editing="nav.isEditing(rowIndex, columnIndex)"
              @begin-edit="startEdit(rowIndex, columnIndex)"
              @end-edit="nav.endEdit()"
              @commit="
                emit('commit-cell', {
                  rowId: row.id,
                  columnId: column.id,
                  value: $event,
                })
              "
            />
          </tr>

          <!-- The trailing ghost row: typing here materialises a real row. -->
          <tr
            class="sheet-grid__row sheet-grid__row--ghost"
            :class="{
              'sheet-grid__row--striped': orderedRows.length % 2 === 1,
            }"
            data-testid="ghost-row"
          >
            <GridCell
              v-for="(column, columnIndex) in orderedColumns"
              :key="column.id"
              :ref="(el) => registerCell(orderedRows.length, columnIndex, el)"
              :editable="!ghostPending"
              :value="null"
              :column="column"
              :focused="nav.isFocused(orderedRows.length, columnIndex)"
              :editing="nav.isEditing(orderedRows.length, columnIndex)"
              @begin-edit="startEdit(orderedRows.length, columnIndex)"
              @end-edit="nav.endEdit()"
              @commit="materialise(column.id, $event)"
            />
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="orderedRows.length === 0"
      class="sheet-grid__empty"
      data-testid="grid-empty"
    >
      Nothing here yet — add your first row, or just start typing in the last
      one.
    </div>

    <div class="sheet-grid__actions">
      <q-btn
        dense
        flat
        no-caps
        icon="add"
        label="Add row"
        data-testid="add-row"
        @click="emit('add-row', {})"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { ComponentPublicInstance } from "vue";
import GridCell from "./GridCell.vue";
import { typeGlyph } from "@/apps/listies/coerce";
import { useGridNavigation } from "@/apps/listies/composables/useGridNavigation";
import type { CellValue, Tab } from "@/apps/listies/types";

const props = defineProps<{ tab: Tab }>();
const emit = defineEmits<{
  "add-row": [cells: Record<string, CellValue>];
  "commit-cell": [
    payload: { rowId: string; columnId: string; value: CellValue },
  ];
}>();

// `order` is authoritative on both axes; array position is an implementation
// detail of however the document was last written.
const orderedColumns = computed(() =>
  [...props.tab.columns].sort((a, b) => a.order - b.order),
);
const orderedRows = computed(() =>
  [...props.tab.rows].sort((a, b) => a.order - b.order),
);

// The ghost row is the extra navigable row past the last real one.
const nav = useGridNavigation(
  () => orderedRows.value.length + 1,
  () => orderedColumns.value.length,
);

type CellInstance = ComponentPublicInstance<
  unknown,
  unknown,
  unknown,
  unknown,
  { commit: () => void }
>;

const cells = new Map<string, CellInstance>();
const key = (rowIndex: number, columnIndex: number) =>
  `${rowIndex}:${columnIndex}`;

function registerCell(
  rowIndex: number,
  columnIndex: number,
  el: Element | ComponentPublicInstance | null,
): void {
  const id = key(rowIndex, columnIndex);
  if (el) cells.set(id, el as CellInstance);
  else cells.delete(id);
}

function startEdit(rowIndex: number, columnIndex: number): void {
  nav.focusCell(rowIndex, columnIndex);
  nav.beginEdit();
}

/**
 * Commit the cell being edited before focus leaves it.
 *
 * Moving removes the editor from the DOM, and removal does not fire `blur` —
 * so without this the keystroke that moves would silently discard the entry.
 */
function commitFocused(): void {
  const at = nav.focused.value;
  if (!at || !nav.editing.value) return;
  cells.get(key(at.rowIndex, at.columnIndex))?.commit();
}

function focusFocusedCell(): void {
  const at = nav.focused.value;
  if (!at) return;
  void nextTick(() => {
    const cell = cells.get(key(at.rowIndex, at.columnIndex));
    (cell?.$el as HTMLElement | undefined)?.focus?.();
  });
}

function onKeydown(event: KeyboardEvent): void {
  if (!nav.focused.value) return;

  switch (event.key) {
    case "Tab":
      event.preventDefault();
      commitFocused();
      if (event.shiftKey) nav.movePrevious();
      else nav.moveNext();
      focusFocusedCell();
      break;
    case "Enter":
      event.preventDefault();
      commitFocused();
      nav.moveDown();
      focusFocusedCell();
      break;
    case "Escape":
      nav.endEdit();
      break;
    case "ArrowRight":
    case "ArrowLeft":
    case "ArrowUp":
    case "ArrowDown":
      // While editing, the arrows belong to the text being typed.
      if (nav.editing.value) return;
      event.preventDefault();
      if (event.key === "ArrowRight") nav.moveRight();
      if (event.key === "ArrowLeft") nav.moveLeft();
      if (event.key === "ArrowUp") nav.moveUp();
      if (event.key === "ArrowDown") nav.moveDown();
      focusFocusedCell();
      break;
    default:
      break;
  }
}

// One ghost entry can be in flight at a time: a second keystroke must not
// create a second row. The ghost re-opens once the row has arrived.
const ghostPending = ref(false);

function materialise(columnId: string, value: CellValue): void {
  if (ghostPending.value || value === null) return;
  ghostPending.value = true;
  emit("add-row", { [columnId]: value });
}

watch(
  () => props.tab.rows.length,
  () => {
    ghostPending.value = false;
    nav.clampToGrid();
  },
);

watch(
  () => props.tab.id,
  () => {
    nav.focusCell(-1, -1);
  },
);
</script>

<style scoped>
.sheet-grid {
  --listies-gridline: rgba(255, 255, 255, 0.08);
  --listies-muted: rgba(255, 255, 255, 0.35);
}

/* Wide-first: a dense grid scrolls sideways rather than reflowing (NFR-1). */
.sheet-grid__scroll {
  overflow: auto;
  max-height: 70vh;
  border: 1px solid var(--listies-gridline);
  border-radius: 6px;
}

.sheet-grid__table {
  border-collapse: separate;
  border-spacing: 0;
  width: 100%;
  font-size: 0.875rem;
}

.sheet-grid__header {
  position: sticky;
  top: 0;
  z-index: 1;
  text-align: left;
  padding: 0.45rem 0.6rem;
  background: var(--q-dark-page, #1d1d1d);
  border-bottom: 1px solid var(--listies-gridline);
  border-right: 1px solid var(--listies-gridline);
  font-weight: 600;
  white-space: nowrap;
}

.sheet-grid__header--number {
  text-align: right;
}

.sheet-grid__glyph {
  opacity: 0.45;
  margin-right: 0.35rem;
  font-size: 0.75em;
}

.sheet-grid__row--striped {
  background: rgba(255, 255, 255, 0.025);
}

.sheet-grid__row--ghost {
  opacity: 0.75;
}

.sheet-grid__empty {
  padding: 1rem 0.25rem;
  opacity: 0.6;
}

.sheet-grid__actions {
  margin-top: 0.25rem;
}
</style>
