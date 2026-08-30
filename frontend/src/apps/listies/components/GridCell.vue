<template>
  <td
    class="grid-cell"
    :class="{
      'grid-cell--number': column.type === 'number',
      'grid-cell--empty': isEmpty && !editing,
      'grid-cell--invalid': invalid !== null,
    }"
    @click="beginEdit"
  >
    <template v-if="editing">
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
    <template v-else>{{ formatCell(value, column.type) }}</template>
  </td>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { formatCell, parseCell } from "@/apps/listies/coerce";
import type { CellValue, Column } from "@/apps/listies/types";

const props = withDefaults(
  defineProps<{ value: CellValue; column: Column; editable?: boolean }>(),
  { editable: false },
);
const emit = defineEmits<{ commit: [value: CellValue] }>();

const editing = ref(false);
const draft = ref("");
const invalid = ref<string | null>(null);
const inputEl = ref<HTMLInputElement | null>(null);

// `null` is empty; 0 and "" are not — they are values the user entered.
const isEmpty = computed(
  () => props.value === null || props.value === undefined,
);

// Text and date both edit as strings, but a date edits in ISO form (the
// native picker's format) rather than the "02 Sep 26" display form.
// A date gets the native picker — it is a real gain and it enforces ISO. A
// number deliberately does NOT: a native number input silently discards what
// it cannot parse, so a typo would clear the cell instead of being explained.
const inputType = computed(() =>
  props.column.type === "date" ? "date" : "text",
);
const inputMode = computed(() =>
  props.column.type === "number" ? "decimal" : undefined,
);

function beginEdit(): void {
  if (!props.editable || editing.value) return;
  draft.value = props.value === null ? "" : String(props.value);
  invalid.value = null;
  editing.value = true;
  void nextTick(() => inputEl.value?.select());
}

function commit(): void {
  if (!editing.value) return;

  const result = parseCell(draft.value, props.column.type);
  if (!result.ok) {
    // Stay in the editor so the entry can be corrected rather than lost.
    invalid.value = result.error;
    return;
  }

  invalid.value = null;
  editing.value = false;
  const current = props.value ?? null;
  if (result.value !== current) emit("commit", result.value);
}

function cancel(): void {
  editing.value = false;
  invalid.value = null;
}
</script>

<style scoped>
.grid-cell {
  padding: 0.35rem 0.6rem;
  border-right: 1px solid var(--listies-gridline, rgba(255, 255, 255, 0.08));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 20rem;
}

.grid-cell--number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.grid-cell--empty {
  color: var(--listies-muted, rgba(255, 255, 255, 0.35));
}

.grid-cell--invalid {
  outline: 1px solid var(--q-negative, #c10015);
  outline-offset: -1px;
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

.grid-cell__error {
  font-size: 0.7rem;
  color: var(--q-negative, #c10015);
}
</style>
