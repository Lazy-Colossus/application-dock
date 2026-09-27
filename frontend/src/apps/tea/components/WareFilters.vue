<template>
  <div class="scrim" @click="emit('close')"></div>
  <div class="sheet ware-filters" data-testid="ware-filters-sheet">
    <p class="ware-filters__tier">Type</p>
    <div class="ware-filters__chips">
      <button
        v-for="type in types"
        :key="type"
        :class="['chip', { 'chip--on': filters.type === type }]"
        :data-testid="`ware-filter-type-${type}`"
        @click="filters.type = filters.type === type ? null : type"
      >
        {{ WARE_TYPE_LABELS[type].label }}
      </button>
    </div>

    <template v-if="materials.length">
      <p class="ware-filters__tier">Material</p>
      <div class="ware-filters__chips">
        <button
          v-for="material in materials"
          :key="material"
          :class="['chip', { 'chip--on': filters.material === material }]"
          :data-testid="`ware-filter-material-${material}`"
          @click="filters.material = filters.material === material ? null : material"
        >
          {{ MATERIAL_LABELS[material] }}
        </button>
      </div>
    </template>

    <p class="ware-filters__tier">Volume (ml)</p>
    <div class="ware-filters__range">
      <input
        class="sheet__field"
        data-testid="ware-filter-min"
        inputmode="numeric"
        placeholder="from"
        aria-label="Volume from, ml"
        :value="filters.minMl ?? ''"
        @input="filters.minMl = asMl($event)"
      />
      <input
        class="sheet__field"
        data-testid="ware-filter-max"
        inputmode="numeric"
        placeholder="to"
        aria-label="Volume to, ml"
        :value="filters.maxMl ?? ''"
        @input="filters.maxMl = asMl($event)"
      />
    </div>

    <label class="ware-filters__check">
      <input v-model="filters.showRetired" type="checkbox" data-testid="ware-filter-retired" />
      Show retired pieces
    </label>

    <button class="sheet__save" data-testid="ware-filters-done" @click="emit('close')">
      {{ matchCount === 1 ? "Show 1 piece" : `Show ${matchCount} pieces` }}
    </button>
    <button
      v-if="filters.activeCount > 0"
      class="sheet__cancel"
      data-testid="ware-filters-clear"
      @click="filters.clear()"
    >
      Clear filters
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { MATERIAL_LABELS, WARE_TYPE_LABELS, WARE_TYPE_ORDER } from "../ware";
import { useTeawareFiltersStore } from "../stores/useTeawareFiltersStore";
import type { Teaware, TeawareMaterial } from "../types";

const props = defineProps<{ items: Teaware[]; matchCount: number }>();
const emit = defineEmits<{ close: [] }>();

const filters = useTeawareFiltersStore();

// Only what the cabinet actually holds — a chip that can only empty the shelf is noise.
const types = computed(() => WARE_TYPE_ORDER.filter((t) => props.items.some((i) => i.type === t)));
const materials = computed(() =>
  (Object.keys(MATERIAL_LABELS) as TeawareMaterial[]).filter((m) =>
    props.items.some((i) => i.material === m),
  ),
);

function asMl(event: Event): number | null {
  const raw = (event.target as HTMLInputElement).value.trim();
  const parsed = Number(raw);
  return raw !== "" && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
</script>

<style scoped lang="scss">
@import "./timer-sheet.scss";

.scrim {
  position: fixed;
  inset: 0;
  z-index: 19;
  background: rgba(0, 0, 0, 0.45);
}
.ware-filters {
  max-height: 85vh;
  overflow-y: auto;
}
.ware-filters__tier {
  color: #6b5f52;
  font-size: 11.5px;
  margin: 10px 0 4px;
}
.ware-filters__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding: 6px 0;
}
.chip {
  border: 1px solid #2e271f;
  background: transparent;
  color: #e4d9c6;
  font-family: inherit;
  font-size: 13px;
  padding: 5px 11px;
  border-radius: 14px;
  cursor: pointer;
}
.chip--on {
  background: #e4d9c6;
  border-color: #e4d9c6;
  color: #17120e;
  font-weight: 600;
}
.ware-filters__range {
  display: flex;
  gap: 10px;
}
.ware-filters__check {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #e4d9c6;
  font-size: 14px;
  padding: 12px 0 4px;
}
</style>
