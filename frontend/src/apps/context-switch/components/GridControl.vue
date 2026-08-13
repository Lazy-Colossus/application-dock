<template>
  <div class="cs-grid-control row items-center q-gutter-sm">
    <span class="cs-grid-label">Grid</span>
    <input
      type="number"
      class="cs-grid-input"
      :min="GRID_MIN"
      :max="GRID_MAX"
      :value="modelValue.columns"
      aria-label="Columns"
      data-testid="grid-columns"
      @change="emitGrid('columns', $event)"
    />
    <span class="cs-grid-times">×</span>
    <input
      type="number"
      class="cs-grid-input"
      :min="GRID_MIN"
      :max="GRID_MAX"
      :value="modelValue.rows"
      aria-label="Rows"
      data-testid="grid-rows"
      @change="emitGrid('rows', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { GRID_MAX, GRID_MIN, clampGridValue } from "@/apps/context-switch/grid";
import type { Grid } from "@/apps/context-switch/types";

const props = defineProps<{ modelValue: Grid }>();

const emit = defineEmits<{ "update:modelValue": [grid: Grid] }>();

function emitGrid(field: keyof Grid, event: Event): void {
  const raw = Number((event.target as HTMLInputElement).value);
  const next = { ...props.modelValue, [field]: clampGridValue(raw) };
  if (
    next.columns === props.modelValue.columns &&
    next.rows === props.modelValue.rows
  ) {
    return;
  }
  emit("update:modelValue", next);
}
</script>

<style scoped lang="sass">
.cs-grid-label, .cs-grid-times
  font-size: 13px
  color: #5f6368

.cs-grid-input
  width: 52px
  padding: 4px 6px
  border: 1px solid rgba(0, 0, 0, 0.24)
  border-radius: 6px
  font-size: 14px
</style>
