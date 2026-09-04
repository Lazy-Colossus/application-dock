<template>
  <q-menu>
    <q-list dense style="min-width: 14rem">
      <!-- Rename -->
      <template v-if="mode === 'rename'">
        <q-item>
          <q-item-section>
            <q-input
              v-model="draftName"
              dense
              outlined
              autofocus
              data-testid="rename-column-input"
            />
          </q-item-section>
        </q-item>
        <q-item>
          <q-item-section>
            <div class="row justify-end q-gutter-xs">
              <q-btn
                dense
                flat
                no-caps
                label="Cancel"
                data-testid="rename-column-cancel"
                @click="reset"
              />
              <q-btn
                dense
                flat
                no-caps
                color="primary"
                label="Save"
                :disable="!draftName.trim()"
                data-testid="rename-column-save"
                @click="saveRename"
              />
            </div>
          </q-item-section>
        </q-item>
      </template>

      <!-- Retype -->
      <template v-else-if="mode === 'retype'">
        <q-item>
          <q-item-section>
            <q-select
              v-model="draftType"
              dense
              outlined
              emit-value
              map-options
              :options="typeOptions"
              data-testid="retype-select"
            />
          </q-item-section>
        </q-item>
        <q-item v-if="blankedCount > 0">
          <q-item-section>
            <div
              class="text-negative text-caption"
              data-testid="retype-warning"
            >
              This empties {{ blankedCount }}
              {{ blankedCount === 1 ? "value" : "values" }} that cannot be read
              as {{ draftType }}.
            </div>
          </q-item-section>
        </q-item>
        <q-item>
          <q-item-section>
            <div class="row justify-end q-gutter-xs">
              <q-btn
                dense
                flat
                no-caps
                label="Cancel"
                data-testid="retype-cancel"
                @click="reset"
              />
              <q-btn
                dense
                flat
                no-caps
                :color="blankedCount > 0 ? 'negative' : 'primary'"
                :label="blankedCount > 0 ? 'Change anyway' : 'Change'"
                data-testid="retype-apply"
                @click="applyRetype"
              />
            </div>
          </q-item-section>
        </q-item>
      </template>

      <!-- Delete confirmation -->
      <template v-else-if="mode === 'delete'">
        <q-item>
          <q-item-section>
            <div class="text-caption">
              Delete “{{ column.name }}” and its {{ filledCount }}
              {{ filledCount === 1 ? "value" : "values" }}?
            </div>
          </q-item-section>
        </q-item>
        <q-item>
          <q-item-section>
            <div class="row justify-end q-gutter-xs">
              <q-btn
                dense
                flat
                no-caps
                label="Keep"
                data-testid="delete-column-cancel"
                @click="reset"
              />
              <q-btn
                dense
                flat
                no-caps
                color="negative"
                label="Delete"
                data-testid="delete-column-confirm"
                @click="confirmDelete"
              />
            </div>
          </q-item-section>
        </q-item>
      </template>

      <!-- Filter (Story 2.9) — a type-aware editor -->
      <template v-else-if="mode === 'filter'">
        <!-- text / place: a contains search -->
        <q-item v-if="column.type === 'text' || column.type === 'place'">
          <q-item-section>
            <q-input
              v-model="draftContains"
              dense
              outlined
              autofocus
              placeholder="Contains…"
              data-testid="filter-text"
              @keyup.enter="applyFilter"
            />
          </q-item-section>
        </q-item>

        <!-- number: an operator and value / range -->
        <template v-else-if="column.type === 'number'">
          <q-item>
            <q-item-section>
              <q-select
                v-model="draftNumOp"
                dense
                outlined
                emit-value
                map-options
                :options="NUMBER_OPS"
                data-testid="filter-number-op"
              />
            </q-item-section>
          </q-item>
          <q-item v-if="draftNumOp === 'between'">
            <q-item-section>
              <q-input
                v-model="draftNumMin"
                dense
                outlined
                placeholder="Min"
                data-testid="filter-number-min"
              />
            </q-item-section>
            <q-item-section>
              <q-input
                v-model="draftNumMax"
                dense
                outlined
                placeholder="Max"
                data-testid="filter-number-max"
              />
            </q-item-section>
          </q-item>
          <q-item v-else>
            <q-item-section>
              <q-input
                v-model="draftNumValue"
                dense
                outlined
                placeholder="Value"
                data-testid="filter-number-value"
                @keyup.enter="applyFilter"
              />
            </q-item-section>
          </q-item>
        </template>

        <!-- date: an operator and date / range -->
        <template v-else-if="column.type === 'date'">
          <q-item>
            <q-item-section>
              <q-select
                v-model="draftDateOp"
                dense
                outlined
                emit-value
                map-options
                :options="DATE_OPS"
                data-testid="filter-date-op"
              />
            </q-item-section>
          </q-item>
          <q-item v-if="draftDateOp === 'between'">
            <q-item-section>
              <q-input
                v-model="draftDateMin"
                dense
                outlined
                placeholder="From YYYY-MM-DD"
                data-testid="filter-date-min"
              />
            </q-item-section>
            <q-item-section>
              <q-input
                v-model="draftDateMax"
                dense
                outlined
                placeholder="To YYYY-MM-DD"
                data-testid="filter-date-max"
              />
            </q-item-section>
          </q-item>
          <q-item v-else>
            <q-item-section>
              <q-input
                v-model="draftDateValue"
                dense
                outlined
                placeholder="YYYY-MM-DD"
                data-testid="filter-date-value"
                @keyup.enter="applyFilter"
              />
            </q-item-section>
          </q-item>
        </template>

        <!-- place_group: pick one or more groups, plus Ungrouped -->
        <template v-else-if="column.type === 'place_group'">
          <q-item
            v-for="opt in groupOptions"
            :key="opt.key"
            clickable
            :data-testid="`filter-group-${opt.key}`"
            @click="toggleGroup(opt.id)"
          >
            <q-item-section avatar>
              <input
                type="checkbox"
                :checked="draftGroupIds.includes(opt.id)"
                :aria-label="opt.name"
                @click.stop="toggleGroup(opt.id)"
              />
            </q-item-section>
            <q-item-section>
              <span class="row items-center no-wrap">
                <span
                  v-if="opt.color"
                  class="chm-swatch"
                  :style="{ background: opt.color }"
                />
                {{ opt.name }}
              </span>
            </q-item-section>
          </q-item>
        </template>

        <q-item>
          <q-item-section>
            <div class="row justify-end q-gutter-xs">
              <q-btn
                dense
                flat
                no-caps
                label="Clear"
                data-testid="filter-clear"
                @click="clearFilter"
              />
              <q-btn
                dense
                flat
                no-caps
                color="primary"
                label="Apply"
                data-testid="filter-apply"
                @click="applyFilter"
              />
            </div>
          </q-item-section>
        </q-item>
      </template>

      <!-- The menu itself -->
      <template v-else>
        <q-item clickable data-testid="menu-rename" @click="startRename">
          <q-item-section>Rename…</q-item-section>
        </q-item>
        <q-item clickable data-testid="menu-retype" @click="startRetype">
          <q-item-section>Change type…</q-item-section>
        </q-item>
        <q-item clickable data-testid="menu-filter" @click="startFilter">
          <q-item-section>
            Filter…
            <span v-if="filterActive" class="chm-filter-on">•</span>
          </q-item-section>
        </q-item>
        <q-item
          clickable
          :disable="!canMoveLeft"
          data-testid="menu-move-left"
          @click="canMoveLeft && emit('move', -1)"
        >
          <q-item-section>Move left</q-item-section>
        </q-item>
        <q-item
          clickable
          :disable="!canMoveRight"
          data-testid="menu-move-right"
          @click="canMoveRight && emit('move', 1)"
        >
          <q-item-section>Move right</q-item-section>
        </q-item>
        <q-item
          v-if="canDelete"
          clickable
          data-testid="menu-delete"
          @click="mode = 'delete'"
        >
          <q-item-section class="text-negative">Delete column…</q-item-section>
        </q-item>
      </template>
    </q-list>
  </q-menu>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { countBlankedByRetype } from "@/apps/listies/coerce";
import { columnTypeOptions } from "@/apps/listies/columnTypes";
import { isActive } from "@/apps/listies/filter";
import type { DateOp, FilterSpec, NumberOp } from "@/apps/listies/filter";
import type { Column, ColumnType, PlaceGroup, Row } from "@/apps/listies/types";

const props = withDefaults(
  defineProps<{
    column: Column;
    rows: Row[];
    canMoveLeft: boolean;
    canMoveRight: boolean;
    canDelete: boolean;
    allowPlace?: boolean;
    groups?: PlaceGroup[];
    currentFilter?: FilterSpec | null;
  }>(),
  { allowPlace: false, groups: () => [], currentFilter: null },
);

const emit = defineEmits<{
  rename: [name: string];
  retype: [type: ColumnType];
  move: [delta: number];
  filter: [spec: FilterSpec | null];
  delete: [];
}>();

type Mode = "menu" | "rename" | "retype" | "delete" | "filter";
const mode = ref<Mode>("menu");
const draftName = ref("");
const draftType = ref<ColumnType>("text");

// ── filter drafts (Story 2.9) ────────────────────────────────────────────
const NUMBER_OPS = [
  { label: "Equals", value: "eq" },
  { label: "Greater than", value: "gt" },
  { label: "Less than", value: "lt" },
  { label: "Between", value: "between" },
];
const DATE_OPS = [
  { label: "On", value: "on" },
  { label: "Before", value: "before" },
  { label: "After", value: "after" },
  { label: "Between", value: "between" },
];

const draftContains = ref("");
const draftNumOp = ref<NumberOp>("eq");
const draftNumValue = ref("");
const draftNumMin = ref("");
const draftNumMax = ref("");
const draftDateOp = ref<DateOp>("on");
const draftDateValue = ref("");
const draftDateMin = ref("");
const draftDateMax = ref("");
const draftGroupIds = ref<(string | null)[]>([]);

const filterActive = computed(
  () => props.currentFilter !== null && isActive(props.currentFilter),
);

// The tab's groups plus an "Ungrouped" option (id `null`) for the absence of a
// group — which also catches a dangling id (Story 4.6).
const groupOptions = computed(() => [
  ...props.groups.map((group) => ({
    key: group.id,
    id: group.id as string | null,
    name: group.name,
    color: group.color as string | null,
  })),
  {
    key: "ungrouped",
    id: null as string | null,
    name: "Ungrouped",
    color: null,
  },
]);

const typeOptions = computed(() => columnTypeOptions(props.allowPlace));

// How much a retype would cost, recomputed as the target type changes, so the
// user sees the price before paying it rather than after.
const blankedCount = computed(() =>
  countBlankedByRetype(props.rows, props.column.id, draftType.value),
);

const filledCount = computed(
  () =>
    props.rows.filter(
      (row) =>
        row.cells[props.column.id] !== undefined &&
        row.cells[props.column.id] !== null,
    ).length,
);

function reset(): void {
  mode.value = "menu";
}

function startRename(): void {
  draftName.value = props.column.name;
  mode.value = "rename";
}

function startRetype(): void {
  draftType.value = props.column.type;
  mode.value = "retype";
}

function startFilter(): void {
  seedFilterDrafts(props.currentFilter);
  mode.value = "filter";
}

/** Populate the editor from the currently-applied filter, if any. */
function seedFilterDrafts(spec: FilterSpec | null): void {
  draftContains.value = "";
  draftNumOp.value = "eq";
  draftNumValue.value = "";
  draftNumMin.value = "";
  draftNumMax.value = "";
  draftDateOp.value = "on";
  draftDateValue.value = "";
  draftDateMin.value = "";
  draftDateMax.value = "";
  draftGroupIds.value = [];
  if (!spec) return;

  if (spec.kind === "text" || spec.kind === "place") {
    draftContains.value = spec.contains;
  } else if (spec.kind === "number") {
    draftNumOp.value = spec.op;
    draftNumValue.value = spec.value?.toString() ?? "";
    draftNumMin.value = spec.min?.toString() ?? "";
    draftNumMax.value = spec.max?.toString() ?? "";
  } else if (spec.kind === "date") {
    draftDateOp.value = spec.op;
    draftDateValue.value = spec.value ?? "";
    draftDateMin.value = spec.min ?? "";
    draftDateMax.value = spec.max ?? "";
  } else {
    draftGroupIds.value = [...spec.groupIds];
  }
}

function toggleGroup(id: string | null): void {
  const current = draftGroupIds.value;
  draftGroupIds.value = current.includes(id)
    ? current.filter((g) => g !== id)
    : [...current, id];
}

function parseNum(text: string): number | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

function trimmed(text: string): string | undefined {
  return text.trim() || undefined;
}

/** Build the FilterSpec for this column's type from the editor drafts. */
function buildSpec(): FilterSpec {
  switch (props.column.type) {
    case "number":
      return draftNumOp.value === "between"
        ? {
            kind: "number",
            op: "between",
            min: parseNum(draftNumMin.value),
            max: parseNum(draftNumMax.value),
          }
        : {
            kind: "number",
            op: draftNumOp.value,
            value: parseNum(draftNumValue.value),
          };
    case "date":
      return draftDateOp.value === "between"
        ? {
            kind: "date",
            op: "between",
            min: trimmed(draftDateMin.value),
            max: trimmed(draftDateMax.value),
          }
        : {
            kind: "date",
            op: draftDateOp.value,
            value: trimmed(draftDateValue.value),
          };
    case "place_group":
      return { kind: "place_group", groupIds: [...draftGroupIds.value] };
    case "place":
      return { kind: "place", contains: draftContains.value };
    default:
      return { kind: "text", contains: draftContains.value };
  }
}

function applyFilter(): void {
  emit("filter", buildSpec());
  reset();
}

function clearFilter(): void {
  emit("filter", null);
  reset();
}

function saveRename(): void {
  const name = draftName.value.trim();
  if (!name) return;
  emit("rename", name);
  reset();
}

function applyRetype(): void {
  emit("retype", draftType.value);
  reset();
}

function confirmDelete(): void {
  emit("delete");
  reset();
}
</script>

<style scoped>
.chm-swatch {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  display: inline-block;
  margin-right: 0.4rem;
  flex: 0 0 auto;
}

.chm-filter-on {
  margin-left: 0.25rem;
  color: var(--q-primary, #1976d2);
}
</style>
