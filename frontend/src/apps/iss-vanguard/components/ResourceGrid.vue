<template>
  <table class="grid" data-testid="resource-grid">
    <thead>
      <tr>
        <th />
        <th v-for="tier in TIERS" :key="tier.id" scope="col">
          {{ tier.name }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="resource in RESOURCES" :key="resource.id">
        <th scope="row" class="grid__name">{{ resource.name }}</th>
        <td v-for="tier in TIERS" :key="tier.id">
          <button
            v-if="mode === 'edit'"
            type="button"
            class="grid__cell grid__cell--tap"
            :data-testid="`cell-${resource.id}-${tier.id}`"
            @click="emit('cell-tap', resource.id, tier.id)"
          >
            {{ grid[resource.id][tier.id] }}
          </button>
          <span
            v-else
            class="grid__cell"
            :class="mode === 'diff' ? tone(grid[resource.id][tier.id]) : ''"
            :data-testid="`cell-${resource.id}-${tier.id}`"
          >
            {{ label(grid[resource.id][tier.id]) }}
          </span>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<script setup lang="ts">
import { RESOURCES, TIERS } from "../resources";
import type { Grid, ResourceId, TierId } from "../types";

const props = defineProps<{ grid: Grid; mode: "edit" | "readonly" | "diff" }>();
const emit = defineEmits<{
  "cell-tap": [resource: ResourceId, tier: TierId];
}>();

function tone(value: number): string {
  if (value < 0) return "grid__cell--short";
  if (value > 0) return "grid__cell--spare";
  return "grid__cell--even";
}

function label(value: number): string {
  return props.mode === "diff" && value > 0 ? `+${value}` : String(value);
}
</script>

<style scoped lang="scss">
.grid {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.grid th {
  font-size: 12px;
  font-weight: 500;
  padding: 4px;
  text-align: center;
}
.grid__name {
  text-align: left !important;
  width: 34%;
}
.grid td {
  padding: 3px;
}
.grid__cell {
  display: block;
  width: 100%;
  min-height: 44px;
  line-height: 44px;
  text-align: center;
  font-size: 18px;
  font-variant-numeric: tabular-nums;
  border-radius: 6px;
  background: rgba(127, 127, 127, 0.12);
}
.grid__cell--tap {
  border: 0;
  cursor: pointer;
  color: inherit;
}
.grid__cell--short {
  color: #e05757;
}
.grid__cell--spare {
  color: #3fa66b;
}
.grid__cell--even {
  opacity: 0.45;
}
</style>
