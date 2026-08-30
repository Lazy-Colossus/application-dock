<template>
  <td
    class="grid-cell"
    :class="{
      'grid-cell--number': column.type === 'number',
      'grid-cell--empty': isEmpty,
    }"
  >
    {{ formatCell(value, column.type) }}
  </td>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { formatCell } from "@/apps/listies/coerce";
import type { CellValue, Column } from "@/apps/listies/types";

const props = defineProps<{ value: CellValue; column: Column }>();

// `null` is empty; 0 and "" are not — they are values the user entered.
const isEmpty = computed(
  () => props.value === null || props.value === undefined,
);
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
</style>
