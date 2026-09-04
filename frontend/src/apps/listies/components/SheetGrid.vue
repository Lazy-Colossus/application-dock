<template>
  <div class="sheet-grid sheet-grid--fill">
    <div
      class="sheet-grid__scroll"
      data-testid="grid-body"
      @keydown="onKeydown"
    >
      <table class="sheet-grid__table">
        <thead>
          <tr>
            <th
              v-if="mappedRowIds !== null"
              class="sheet-grid__header sheet-grid__header--tick"
            />
            <th
              v-for="(column, columnIndex) in orderedColumns"
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
                @click="cycleSort(column.id)"
                >{{ column.name }}</span
              >
              <span
                v-if="sortSpec?.columnId === column.id"
                class="sheet-grid__sort"
                :data-testid="`sort-indicator-${column.id}`"
                >{{ sortSpec.direction === "asc" ? "▲" : "▼" }}</span
              >
              <span
                v-if="isColumnFiltered(column.id)"
                class="sheet-grid__filter-mark"
                title="Filtered"
                :data-testid="`filter-indicator-${column.id}`"
                >▾</span
              >
              <q-btn
                dense
                flat
                round
                size="sm"
                icon="expand_more"
                class="sheet-grid__menu-btn"
                :data-testid="`column-menu-${column.id}`"
              >
                <ColumnHeaderMenu
                  :column="column"
                  :rows="tab.rows"
                  :can-move-left="columnIndex > 0"
                  :can-move-right="columnIndex < orderedColumns.length - 1"
                  :can-delete="orderedColumns.length > 1"
                  :allow-place="allowPlace"
                  :groups="placeGroups"
                  :current-filter="filters[column.id] ?? null"
                  @rename="
                    emit('rename-column', { columnId: column.id, name: $event })
                  "
                  @retype="
                    emit('retype-column', { columnId: column.id, type: $event })
                  "
                  @move="
                    emit('move-column', { columnId: column.id, delta: $event })
                  "
                  @filter="
                    emit('set-filter', { columnId: column.id, spec: $event })
                  "
                  @delete="emit('delete-column', column.id)"
                />
              </q-btn>
            </th>

            <th class="sheet-grid__header sheet-grid__header--actions">
              <q-btn
                dense
                flat
                round
                size="sm"
                icon="add"
                data-testid="add-column"
                @click="startAddColumn"
              >
                <!-- In a popup, not inline: a header cell squeezed between
                     fixed-width columns has no room for a name field. -->
                <q-menu
                  v-model="addingColumn"
                  no-parent-event
                  data-testid="add-column-menu"
                  anchor="bottom right"
                  self="top right"
                >
                  <div
                    class="sheet-grid__add-column column q-gutter-sm q-pa-md"
                  >
                    <q-input
                      v-model="newColumnName"
                      dense
                      outlined
                      autofocus
                      label="Column name"
                      data-testid="add-column-name"
                      @keyup.enter="saveNewColumn"
                    />
                    <q-select
                      v-model="newColumnType"
                      dense
                      outlined
                      emit-value
                      map-options
                      label="Type"
                      :options="typeOptions"
                      data-testid="add-column-type"
                    />
                    <div class="row justify-end q-gutter-xs">
                      <q-btn
                        dense
                        flat
                        no-caps
                        label="Cancel"
                        data-testid="add-column-cancel"
                        @click="addingColumn = false"
                      />
                      <q-btn
                        dense
                        flat
                        no-caps
                        color="primary"
                        label="Add"
                        :disable="!newColumnName.trim()"
                        data-testid="add-column-save"
                        @click="saveNewColumn"
                      />
                    </div>
                  </div>
                </q-menu>
              </q-btn>
            </th>
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="(row, rowIndex) in orderedRows"
            :key="row.id"
            class="sheet-grid__row"
            :class="{
              'sheet-grid__row--striped': rowIndex % 2 === 1,
              'sheet-grid__row--highlighted': row.id === highlightedRowId,
            }"
            :data-testid="`row-${row.id}`"
          >
            <td v-if="mappedRowIds !== null" class="sheet-grid__tick-cell">
              <input
                v-if="hasPlace(row)"
                type="checkbox"
                aria-label="Show this row on the map"
                :checked="mappedRowIds.includes(row.id)"
                :data-testid="`map-tick-${row.id}`"
                @change="emit('toggle-mapped', row.id)"
              />
            </td>
            <GridCell
              v-for="(column, columnIndex) in orderedColumns"
              :key="column.id"
              :ref="(el) => registerCell(rowIndex, columnIndex, el)"
              editable
              :value="row.cells[column.id] ?? null"
              :column="column"
              :focused="nav.isFocused(rowIndex, columnIndex)"
              :editing="nav.isEditing(rowIndex, columnIndex)"
              :maps-enabled="mapsEnabled"
              :near="biasFor(column)"
              :groups="placeGroups"
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

            <td class="sheet-grid__actions-cell">
              <template v-if="confirmingRowId === row.id">
                <q-btn
                  dense
                  flat
                  no-caps
                  color="negative"
                  label="Delete"
                  :data-testid="`delete-row-confirm-${row.id}`"
                  @click="confirmDelete(row.id)"
                />
                <q-btn
                  dense
                  flat
                  no-caps
                  label="Keep"
                  :data-testid="`delete-row-cancel-${row.id}`"
                  @click="confirmingRowId = null"
                />
              </template>
              <q-btn
                v-else
                dense
                flat
                round
                icon="delete"
                :data-testid="`delete-row-${row.id}`"
                @click="confirmingRowId = row.id"
              />
            </td>
          </tr>

          <!-- The trailing ghost row: typing here materialises a real row. -->
          <tr
            class="sheet-grid__row sheet-grid__row--ghost"
            :class="{
              'sheet-grid__row--striped': orderedRows.length % 2 === 1,
            }"
            data-testid="ghost-row"
          >
            <td v-if="mappedRowIds !== null" class="sheet-grid__tick-cell" />
            <GridCell
              v-for="(column, columnIndex) in orderedColumns"
              :key="column.id"
              :ref="(el) => registerCell(orderedRows.length, columnIndex, el)"
              :editable="!ghostPending"
              :value="null"
              :column="column"
              :focused="nav.isFocused(orderedRows.length, columnIndex)"
              :editing="nav.isEditing(orderedRows.length, columnIndex)"
              :maps-enabled="mapsEnabled"
              :near="biasFor(column)"
              :groups="placeGroups"
              @begin-edit="startEdit(orderedRows.length, columnIndex)"
              @end-edit="nav.endEdit()"
              @commit="materialise(column.id, $event)"
            />
            <td class="sheet-grid__actions-cell"></td>
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
import ColumnHeaderMenu from "./ColumnHeaderMenu.vue";
import GridCell from "./GridCell.vue";
import { typeGlyph } from "@/apps/listies/coerce";
import { columnTypeOptions } from "@/apps/listies/columnTypes";
import { sortRowIds } from "@/apps/listies/sort";
import type { SortSpec } from "@/apps/listies/sort";
import { filterRowIds, isActive } from "@/apps/listies/filter";
import type { FilterSpec } from "@/apps/listies/filter";
import { useGridNavigation } from "@/apps/listies/composables/useGridNavigation";
import { isPlace } from "@/apps/listies/types";
import type {
  CellValue,
  Column,
  ColumnType,
  Row,
  Tab,
} from "@/apps/listies/types";

const props = withDefaults(
  defineProps<{
    tab: Tab;
    allowPlace?: boolean;
    mapsEnabled?: boolean;
    /** Where a place column's search should look; supplied by the page. */
    placeCentroid?: (columnId: string) => string | null;
    /** The row the map is pointing at. */
    highlightedRowId?: string | null;
    /** Rows currently plotted; `null` means the map is closed, so no ticks. */
    mappedRowIds?: string[] | null;
    /** Active filters by column id — a view, owned by the page (Story 2.9). */
    filters?: Record<string, FilterSpec>;
  }>(),
  {
    allowPlace: false,
    mapsEnabled: false,
    placeCentroid: () => null,
    highlightedRowId: null,
    mappedRowIds: null,
    filters: () => ({}),
  },
);

// Only a place column has a bias; a text column has nothing to do with places.
/** Only a row with somewhere to plot gets a tick. */
function hasPlace(row: Row): boolean {
  return props.tab.columns.some(
    (column) =>
      column.type === "place" && isPlace(row.cells[column.id] ?? null),
  );
}

function biasFor(column: Column): string | null {
  return column.type === "place" ? props.placeCentroid(column.id) : null;
}
const emit = defineEmits<{
  "add-row": [cells: Record<string, CellValue>];
  "delete-row": [rowId: string];
  "add-column": [spec: { name: string; type: ColumnType }];
  "rename-column": [payload: { columnId: string; name: string }];
  "retype-column": [payload: { columnId: string; type: ColumnType }];
  "move-column": [payload: { columnId: string; delta: number }];
  "delete-column": [columnId: string];
  "select-row": [rowId: string];
  "toggle-mapped": [rowId: string];
  "set-filter": [payload: { columnId: string; spec: FilterSpec | null }];
  "commit-cell": [
    payload: { rowId: string; columnId: string; value: CellValue },
  ];
}>();

// `order` is authoritative on both axes; array position is an implementation
// detail of however the document was last written.
const orderedColumns = computed(() =>
  [...props.tab.columns].sort((a, b) => a.order - b.order),
);
const storedOrder = computed(() =>
  [...props.tab.rows].sort((a, b) => a.order - b.order),
);

// The tab's place groups, threaded to each cell (for its swatch/name) and to
// the sort comparator (a group sorts by its resolved name) — Story 4.6.
const placeGroups = computed(() => props.tab.place_groups ?? []);

// ── filtering + sorting (Stories 2.6, 2.9) ───────────────────────────────
//
// Both are views: they produce a display order of row ids and never write.
// That order is `sort(filter(storedOrder))`, recomputed only when the filter or
// sort *spec* changes — not when a cell value changes — so a row never jumps or
// vanishes out from under the cursor mid-edit.

const sortSpec = ref<SortSpec | null>(null);
const displayRowIds = ref<string[] | null>(null);

const hasActiveFilter = computed(() =>
  Object.values(props.filters).some(isActive),
);

function isColumnFiltered(columnId: string): boolean {
  const spec = props.filters[columnId];
  return spec !== undefined && isActive(spec);
}

const orderedRows = computed(() => {
  const ids = displayRowIds.value;
  if (!ids) return storedOrder.value;
  const byId = new Map(props.tab.rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
});

// Filter first (which rows show), then sort (their order). With neither active
// the display order is left as `null` — the grid falls back to `storedOrder`.
function recompute(): void {
  const spec = sortSpec.value;
  if (!spec && !hasActiveFilter.value) {
    displayRowIds.value = null;
    return;
  }

  let visible = storedOrder.value;
  if (hasActiveFilter.value) {
    const kept = new Set(
      filterRowIds(visible, props.filters, placeGroups.value),
    );
    visible = visible.filter((row) => kept.has(row.id));
  }

  if (spec) {
    const column = props.tab.columns.find((c) => c.id === spec.columnId);
    if (column) {
      displayRowIds.value = sortRowIds(
        visible,
        column,
        spec.direction,
        placeGroups.value,
      );
      return;
    }
  }
  displayRowIds.value = visible.map((row) => row.id);
}

/** Cycle a header: unsorted → ascending → descending → unsorted. */
function cycleSort(columnId: string): void {
  const spec = sortSpec.value;
  if (!spec || spec.columnId !== columnId) {
    sortSpec.value = { columnId, direction: "asc" };
  } else if (spec.direction === "asc") {
    sortSpec.value = { columnId, direction: "desc" };
  } else {
    sortSpec.value = null;
  }
  recompute();
}

// A change to the filter spec recomputes the view — exactly like a sort change,
// and never on a cell edit (the filters object identity only changes when the
// page sets it). Immediate so a filter present at mount is applied at once.
watch(() => props.filters, recompute, { immediate: true });

// Rows arriving or leaving adjust the display order in place: a genuinely new
// row goes to the end rather than jumping into its sorted/filtered position, and
// a removed one is spliced out. Neither re-sorts nor re-filters what is on
// screen. "New" is judged against the *previous* row set — not against
// `displayRowIds` — so rows a filter is hiding are not mistaken for new arrivals.
watch(
  () => props.tab.rows.map((row) => row.id).join("|"),
  (_now, before) => {
    const ids = displayRowIds.value;
    if (!ids) return;
    const present = new Set(props.tab.rows.map((row) => row.id));
    const knownBefore = new Set(before ? before.split("|") : []);
    const kept = ids.filter((id) => present.has(id));
    const added = props.tab.rows
      .map((row) => row.id)
      .filter((id) => !knownBefore.has(id) && !ids.includes(id));
    displayRowIds.value = [...kept, ...added];
  },
);

// The ghost row is the extra navigable row past the last real one.
const nav = useGridNavigation(
  () => orderedRows.value.length + 1,
  () => orderedColumns.value.length,
);

// Only what the grid needs from a cell: commit the editor, seed it with a
// typed character (Story 2.8), and focus the <td>.
interface CellInstance {
  commit: () => void;
  seedDraft: (char: string) => void;
  $el: HTMLElement;
}

const cells = new Map<string, CellInstance>();
const key = (rowIndex: number, columnIndex: number) =>
  `${rowIndex}:${columnIndex}`;

function registerCell(
  rowIndex: number,
  columnIndex: number,
  el: Element | ComponentPublicInstance | null,
): void {
  const id = key(rowIndex, columnIndex);
  if (el) cells.set(id, el as unknown as CellInstance);
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
    cell?.$el?.focus?.();
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
      // Type-to-edit: a printable key on a highlighted (not yet editing) cell
      // opens its editor seeded with that character, like a spreadsheet (Story
      // 2.8). A named key ("ArrowRight", "Enter", …) is longer than one char,
      // so length-1 excludes them; excluding the modifiers leaves Ctrl+C /
      // Cmd+V and the like alone. A bare Shift is fine — its key is the capital.
      if (
        !nav.editing.value &&
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        const at = nav.focused.value;
        if (at) {
          cells.get(key(at.rowIndex, at.columnIndex))?.seedDraft(event.key);
          nav.beginEdit();
        }
      }
      break;
  }
}

const typeOptions = computed(() => columnTypeOptions(props.allowPlace));

const addingColumn = ref(false);
const newColumnName = ref("");
const newColumnType = ref<ColumnType>("text");

function startAddColumn(): void {
  newColumnName.value = "";
  newColumnType.value = "text";
  addingColumn.value = true;
}

function saveNewColumn(): void {
  const name = newColumnName.value.trim();
  if (!name) return;
  emit("add-column", { name, type: newColumnType.value });
  addingColumn.value = false;
}

// Deleting a row destroys data with no undo, so it always confirms first —
// inline, and only ever for one row at a time.
const confirmingRowId = ref<string | null>(null);

function confirmDelete(rowId: string): void {
  confirmingRowId.value = null;
  emit("delete-row", rowId);
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
  (count, previous) => {
    const materialised = ghostPending.value && count > (previous ?? 0);
    ghostPending.value = false;
    nav.clampToGrid();

    // The row the user just typed into is now a real row, and a fresh empty
    // one sits beneath it. Follow down so there is always a ready row under
    // the cursor — otherwise entry stalls on the row that was just filled.
    if (materialised) {
      nav.moveDown();
      focusFocusedCell();
    }
  },
);

// Whatever the focus lands on is what the map should point at — clicking a
// cell or walking down with the keyboard both count. The ghost row is not a
// row yet, so it names nothing.
watch(
  () => nav.focused.value?.rowIndex ?? null,
  (rowIndex) => {
    if (rowIndex === null) return;
    const row = orderedRows.value[rowIndex];
    if (row) emit("select-row", row.id);
  },
);

watch(
  () => props.tab.id,
  () => {
    nav.focusCell(-1, -1);
    // A sort belongs to the tab being looked at.
    sortSpec.value = null;
    displayRowIds.value = null;
  },
);
</script>

<style scoped>
.sheet-grid {
  --listies-gridline: rgba(255, 255, 255, 0.08);
  --listies-muted: rgba(255, 255, 255, 0.35);
  /* Every data column is this wide; the table scrolls sideways rather than
     squeezing columns until their headers are unreadable. */
  --listies-column-width: 12rem;
}

/* The page hands the grid its height (SheetPage); the grid must not cap
   itself, or the tab bar ends up floating above the fold. */
.sheet-grid--fill {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

/* Wide-first: a dense grid scrolls sideways rather than reflowing (NFR-1). */
.sheet-grid__scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--listies-gridline);
  border-radius: 6px;
}

.sheet-grid__table {
  border-collapse: separate;
  border-spacing: 0;
  /* Not 100%: fixed columns plus max-content is what makes the table scroll
     horizontally instead of compressing. */
  width: max-content;
  min-width: 100%;
  table-layout: fixed;
  font-size: 0.875rem;
}

.sheet-grid__header:not(.sheet-grid__header--actions),
.sheet-grid__table :deep(.grid-cell) {
  width: var(--listies-column-width);
  max-width: var(--listies-column-width);
}

.sheet-grid__add-column {
  min-width: 16rem;
}

.sheet-grid__header {
  /* Picks up the active tab's colour when it has one (set by SheetPage). */
  border-top: 2px solid var(--listies-accent, transparent);
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

.sheet-grid__header-name {
  cursor: pointer;
}

.sheet-grid__sort {
  margin-left: 0.25rem;
  font-size: 0.7em;
  opacity: 0.7;
}

.sheet-grid__menu-btn {
  opacity: 0.5;
}

.sheet-grid__filter-mark {
  margin-left: 0.2rem;
  font-size: 0.7em;
  color: var(--q-primary, #1976d2);
}

.sheet-grid__header:hover .sheet-grid__header-name {
  cursor: pointer;
}

.sheet-grid__sort {
  margin-left: 0.25rem;
  font-size: 0.7em;
  opacity: 0.7;
}

.sheet-grid__menu-btn {
  opacity: 1;
}

.sheet-grid__glyph {
  opacity: 0.45;
  margin-right: 0.35rem;
  font-size: 0.75em;
}

.sheet-grid__row--striped {
  background: rgba(255, 255, 255, 0.025);
}

.sheet-grid__row--highlighted {
  background: rgba(255, 255, 255, 0.09);
}

.sheet-grid__header--tick,
.sheet-grid__tick-cell {
  width: 1%;
  padding: 0 0.4rem;
  text-align: center;
  border-right: 1px solid var(--listies-gridline);
}

.sheet-grid__header--actions,
.sheet-grid__actions-cell {
  width: 1%;
  white-space: nowrap;
  text-align: right;
  padding: 0 0.25rem;
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
