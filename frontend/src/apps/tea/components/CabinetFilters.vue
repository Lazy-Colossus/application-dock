<template>
  <div class="scrim" data-testid="filters-scrim" @click="emit('close')"></div>
  <div class="sheet" data-testid="filters-sheet">
    <div class="sheet__grab"></div>

    <label class="sheet__check">
      <input v-model="filters.showEmpty" type="checkbox" data-testid="filter-show-empty" />
      Show teas with 0g left
    </label>

    <div v-for="tier in tiers" :key="tier.parentId ?? 'root'" data-testid="filter-tier">
      <p class="sheet__tier">{{ tier.label }}</p>
      <div class="sheet__chips">
        <button
          v-for="node in tier.nodes"
          :key="node.id"
          :class="['chip', { 'chip--on': chosenIds.includes(node.id) }]"
          :style="chipStyle(node)"
          :data-testid="`filter-node-${node.id}`"
          @click="toggleNode(node)"
        >
          {{ node.name }}
          <span v-if="node.name_zh" lang="zh">{{ node.name_zh }}</span>
        </button>
      </div>
    </div>

    <template v-if="countries.length">
      <p class="sheet__tier">Country</p>
      <div class="sheet__chips">
        <button
          v-for="country in countries"
          :key="country"
          :class="['chip', 'chip--plain', { 'chip--on': filters.country === country }]"
          :data-testid="`filter-country-${country}`"
          @click="filters.country = filters.country === country ? null : country"
        >
          {{ country }}
        </button>
      </div>
    </template>

    <button class="sheet__save" data-testid="filters-done" @click="emit('close')">
      {{ doneLabel }}
    </button>
    <button
      v-if="filters.activeCount > 0"
      class="sheet__cancel"
      data-testid="filters-clear"
      @click="filters.clear()"
    >
      Clear filters
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { childrenOf, pathOf } from "../catalogue";
import { CLASS_TOKENS } from "../tokens";
import { useTeaCabinetFiltersStore } from "../stores/useTeaCabinetFiltersStore";
import type { CatalogueNode, Tea, TeaClass } from "../types";

const props = defineProps<{
  teas: Tea[];
  nodes: CatalogueNode[];
  countryFor: (tea: Tea) => string | null;
  matchCount: number;
}>();
const emit = defineEmits<{ close: [] }>();

const filters = useTeaCabinetFiltersStore();

interface Tier {
  parentId: string | null;
  label: string;
  nodes: CatalogueNode[];
}

// Only nodes some tea in the cabinet actually sits under — a pill that can
// only ever empty the shelf is noise.
const ownedIds = computed(
  () =>
    new Set(
      props.teas.flatMap((tea) => pathOf(props.nodes, tea.catalogue_node_id)).map((n) => n.id),
    ),
);
const owned = (parentId: string | null) =>
  childrenOf(props.nodes, parentId).filter((node) => ownedIds.value.has(node.id));

const chosen = computed(() => (filters.nodeId ? pathOf(props.nodes, filters.nodeId) : []));
const chosenIds = computed(() => chosen.value.map((node) => node.id));

const tiers = computed<Tier[]>(() => {
  const result: Tier[] = [{ parentId: null, label: "Class", nodes: owned(null) }];
  for (const node of chosen.value) {
    const children = owned(node.id);
    if (children.length === 0) break;
    result.push({
      parentId: node.id,
      label: `Kind of ${node.name.toLowerCase()}`,
      nodes: children,
    });
  }
  return result;
});

const countries = computed(() =>
  [...new Set(props.teas.map(props.countryFor).filter((c): c is string => c !== null))].sort(),
);

const doneLabel = computed(() =>
  props.matchCount === 1 ? "Show 1 tea" : `Show ${props.matchCount} teas`,
);

// Tapping a chosen pill steps back up to its parent, so the same gesture that
// narrows also widens again.
function toggleNode(node: CatalogueNode): void {
  filters.nodeId = chosenIds.value.includes(node.id) ? node.parent_id : node.id;
}

function chipStyle(node: CatalogueNode): Record<string, string> {
  const classId = (chosen.value[0]?.id ?? node.id) as TeaClass;
  const tokens =
    node.parent_id === null
      ? (CLASS_TOKENS[node.id as TeaClass] ?? CLASS_TOKENS.other)
      : (CLASS_TOKENS[classId] ?? CLASS_TOKENS.other);
  return chosenIds.value.includes(node.id)
    ? { background: tokens.liquor, borderColor: tokens.liquor, color: "#17120E" }
    : { color: tokens.head };
}
</script>

<style scoped lang="scss">
.scrim {
  position: fixed;
  inset: 0;
  z-index: 7;
  background: rgba(0, 0, 0, 0.45);
}
.sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 8;
  max-height: 85vh;
  overflow-y: auto;
  background: #1e1712;
  border-top: 1px solid #33291f;
  border-radius: 14px 14px 0 0;
  padding: 16px 18px 24px;
  box-shadow: 0 -20px 40px rgba(0, 0, 0, 0.5);
}
.sheet__grab {
  width: 34px;
  height: 3px;
  background: #3b3026;
  border-radius: 2px;
  margin: 0 auto 16px;
}
.sheet__check {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #e4d9c6;
  font-size: 14px;
  padding: 14px 0 6px;
  cursor: pointer;
}
.sheet__check input {
  accent-color: #e4d9c6;
  width: 16px;
  height: 16px;
}
.sheet__tier {
  color: #6b5f52;
  font-size: 11.5px;
  margin: 10px 0 4px;
}
.sheet__chips {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  padding: 6px 0 6px;
}
.chip {
  border: 1px solid #2e271f;
  background: transparent;
  font-size: 13px;
  padding: 5px 11px;
  border-radius: 14px;
  cursor: pointer;
  font-family: inherit;
}
.chip--on {
  font-weight: 600;
}
// Country is not a tea's liquor, so it stays bone/ink (DESIGN.md).
.chip--plain {
  color: #e4d9c6;
}
.chip--plain.chip--on {
  background: #e4d9c6;
  border-color: #e4d9c6;
  color: #17120e;
}
.sheet__save {
  display: block;
  width: 100%;
  margin-top: 20px;
  background: #e4d9c6;
  color: #17120e;
  border: 0;
  font-size: 15px;
  font-weight: 600;
  padding: 12px;
  border-radius: 3px;
  cursor: pointer;
}
.sheet__cancel {
  display: block;
  width: 100%;
  margin-top: 10px;
  background: transparent;
  border: 0;
  color: #6b5f52;
  font-size: 13.5px;
  cursor: pointer;
}
</style>
