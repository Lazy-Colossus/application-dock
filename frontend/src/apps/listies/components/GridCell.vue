<template>
  <td
    class="grid-cell"
    :class="{
      'grid-cell--number': column.type === 'number',
      'grid-cell--empty': isEmpty && !editing,
      'grid-cell--invalid': invalid !== null,
      'grid-cell--focused': focused,
    }"
    :tabindex="editable ? 0 : undefined"
    @click="requestEdit"
  >
    <!-- A place is chosen from search results, so it gets its own editor
         rather than a text box (Story 4.3). -->
    <PlaceCell
      v-if="isPlaceColumn && editing"
      :value="isPlace(value) ? value : null"
      :enabled="mapsEnabled"
      :near="near"
      @select="pickPlace"
      @clear="clearPlace"
      @cancel="emit('end-edit')"
    />

    <template v-else-if="editing">
      <input
        ref="inputEl"
        v-model="draft"
        class="grid-cell__input"
        :type="inputType"
        :inputmode="inputMode"
        @blur="commit"
        @keydown.enter.prevent="commit"
        @keydown.esc.prevent="cancel"
      />
      <div v-if="invalid" class="grid-cell__error">{{ invalid }}</div>
    </template>
    <template v-else>
      <template v-if="isPlace(value)">
        <div class="grid-cell__place">{{ value.name }}</div>
        <div v-if="value.address" class="grid-cell__address">
          {{ value.address }}
        </div>
      </template>
      <template v-else>{{ formatCell(value, column.type) }}</template>
    </template>
  </td>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import PlaceCell from "./PlaceCell.vue";
import { formatCell, parseCell } from "@/apps/listies/coerce";
import { isPlace } from "@/apps/listies/types";
import type { CellValue, Column, Place } from "@/apps/listies/types";

/**
 * One cell. Editing is **parent-controlled**: the grid owns which cell is being
 * edited, because the keyboard moves that selection across cells (Story 2.3).
 * This component asks (`begin-edit` / `end-edit`) and reports (`commit`).
 */
const props = withDefaults(
  defineProps<{
    value: CellValue;
    column: Column;
    editable?: boolean;
    editing?: boolean;
    focused?: boolean;
    mapsEnabled?: boolean;
    near?: string | null;
  }>(),
  {
    editable: false,
    editing: false,
    focused: false,
    mapsEnabled: false,
    near: null,
  },
);

const emit = defineEmits<{
  commit: [value: CellValue];
  "begin-edit": [];
  "end-edit": [];
}>();

const draft = ref<string | number>("");
const invalid = ref<string | null>(null);
const inputEl = ref<HTMLInputElement | null>(null);

// `null` is empty; 0 and "" are not — they are values the user entered.
const isPlaceColumn = computed(() => props.column.type === "place");

const isEmpty = computed(
  () => props.value === null || props.value === undefined,
);

// A date gets the native picker — it is a real gain and it enforces ISO. A
// number deliberately does NOT: a native number input silently discards what
// it cannot parse, so a typo would clear the cell instead of being explained.
const inputType = computed(() =>
  props.column.type === "date" ? "date" : "text",
);
const inputMode = computed(() =>
  props.column.type === "number" ? "decimal" : undefined,
);

watch(
  () => props.editing,
  (editing) => {
    if (editing) {
      draft.value = props.value === null ? "" : String(props.value);
      invalid.value = null;
      void nextTick(() => inputEl.value?.select());
    } else {
      invalid.value = null;
    }
  },
  { immediate: true },
);

function requestEdit(): void {
  if (!props.editable || props.editing) return;
  emit("begin-edit");
}

function pickPlace(place: Place): void {
  emit("commit", place);
  emit("end-edit");
}

function clearPlace(): void {
  emit("commit", null);
  emit("end-edit");
}

function commit(): void {
  if (!props.editing) return;

  // The grid commits the focused cell before moving (Story 2.3). A place cell
  // has no typed text to save, so that must simply let go — treating the
  // search box as an invalid entry would trap the cursor in the cell.
  if (isPlaceColumn.value) {
    emit("end-edit");
    return;
  }

  const result = parseCell(String(draft.value ?? ""), props.column.type);
  if (!result.ok) {
    // Stay in the editor so the entry can be corrected rather than lost.
    invalid.value = result.error;
    return;
  }

  invalid.value = null;
  const current = props.value ?? null;
  if (result.value !== current) emit("commit", result.value);
  emit("end-edit");
}

function cancel(): void {
  invalid.value = null;
  emit("end-edit");
}

defineExpose({ commit });
</script>

<style scoped>
.grid-cell {
  padding: 0.35rem 0.6rem;
  border-right: 1px solid var(--listies-gridline, rgba(255, 255, 255, 0.08));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 20rem;
  outline: none;
}

.grid-cell--number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.grid-cell--empty {
  color: var(--listies-muted, rgba(255, 255, 255, 0.35));
}

.grid-cell--focused {
  box-shadow: inset 0 0 0 2px var(--q-primary, #1976d2);
}

.grid-cell--invalid {
  box-shadow: inset 0 0 0 2px var(--q-negative, #c10015);
}

.grid-cell__input {
  width: 100%;
  min-width: 4rem;
  background: transparent;
  border: none;
  outline: none;
  color: inherit;
  font: inherit;
  text-align: inherit;
}

.grid-cell__place {
  font-weight: 500;
}

.grid-cell__address {
  font-size: 0.7rem;
  opacity: 0.55;
  overflow: hidden;
  text-overflow: ellipsis;
}

.grid-cell__error {
  font-size: 0.7rem;
  color: var(--q-negative, #c10015);
}
</style>
