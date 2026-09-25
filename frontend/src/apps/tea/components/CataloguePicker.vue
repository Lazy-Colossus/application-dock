<template>
  <div class="picker" data-testid="picker">
    <div v-for="tier in tiers" :key="tier.parentId ?? 'root'" data-testid="tier">
      <p class="picker__tier">{{ tier.label }}</p>
      <div class="picker__chips">
        <button
          v-for="node in tier.nodes"
          :key="node.id"
          :class="['chip', { 'chip--on': chosenIds.includes(node.id) }]"
          :style="chipStyle(node.id)"
          :data-testid="`chip-${node.id}`"
          @click="choose(node.id)"
        >
          {{ node.name }}
          <span v-if="node.name_zh" lang="zh">{{ node.name_zh }}</span>
        </button>

        <button
          v-if="tier.parentId"
          class="chip chip--add"
          :data-testid="`add-${tier.parentId}`"
          @click="emit('add-node', tier.parentId)"
        >
          + Add one
        </button>
      </div>
    </div>

    <p v-if="prefill" class="picker__prefill" data-testid="picker-prefill">
      Origin will fill in as <em>{{ prefill }}</em> — you can change it.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { childrenOf, pathOf, prefillOriginFor } from "../catalogue";
import { CLASS_TOKENS } from "../tokens";
import type { CatalogueNode, TeaClass } from "../types";

const props = defineProps<{ nodes: CatalogueNode[]; modelValue: string | null }>();
const emit = defineEmits<{
  "update:modelValue": [nodeId: string];
  prefill: [origin: string];
  "add-node": [parentId: string];
}>();

interface Tier {
  parentId: string | null;
  label: string;
  nodes: CatalogueNode[];
}

/** Root-first ancestry of the current choice — which is also which tiers are open. */
const chosen = computed(() =>
  props.modelValue ? pathOf(props.nodes, props.modelValue) : [],
);
const chosenIds = computed(() => chosen.value.map((node) => node.id));

const tiers = computed<Tier[]>(() => {
  const result: Tier[] = [
    { parentId: null, label: "Class", nodes: childrenOf(props.nodes, null) },
  ];
  // A tier appears only when the node above it actually has children, so the
  // picker stops where the taxonomy stops rather than showing empty rows.
  for (const node of chosen.value) {
    const children = childrenOf(props.nodes, node.id);
    if (children.length === 0) break;
    result.push({
      parentId: node.id,
      label: `Kind of ${node.name.toLowerCase()}`,
      nodes: children,
    });
  }
  return result;
});

const prefill = computed(() =>
  props.modelValue ? prefillOriginFor(props.nodes, props.modelValue) : "",
);

const classTokens = computed(() => {
  const root = chosen.value[0];
  const id = (root?.id ?? "other") as TeaClass;
  return CLASS_TOKENS[id] ?? CLASS_TOKENS.other;
});

function chipStyle(nodeId: string): Record<string, string> {
  const isClassTier = props.nodes.find((n) => n.id === nodeId)?.parent_id === null;
  const tokens = isClassTier
    ? (CLASS_TOKENS[nodeId as TeaClass] ?? CLASS_TOKENS.other)
    : classTokens.value;
  return chosenIds.value.includes(nodeId)
    ? { background: tokens.liquor, borderColor: tokens.liquor, color: "#17120E" }
    : { color: tokens.head };
}

function choose(nodeId: string): void {
  emit("update:modelValue", nodeId);
  emit("prefill", prefillOriginFor(props.nodes, nodeId));
}
</script>

<style scoped lang="scss">
.picker__tier {
  color: #6b5f52;
  font-size: 11.5px;
  margin: 0 0 4px;
}
.picker__chips {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  padding: 6px 0 14px;
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
.chip--add {
  border-style: dashed;
  border-color: #4a3d2e;
  color: #8b7a63;
}
.picker__prefill {
  border-top: 1px solid #2a231c;
  padding-top: 14px;
  color: #7a6d5e;
  font-size: 12.5px;
}
.picker__prefill em {
  color: #c7a271;
  font-style: normal;
}
</style>
