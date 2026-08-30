<template>
  <div class="tab-bar row items-center no-wrap">
    <q-btn
      v-for="tab in orderedTabs"
      :key="tab.id"
      dense
      no-caps
      size="sm"
      class="tab-bar__chip"
      :color="tab.id === activeTabId ? 'primary' : undefined"
      :outline="tab.id !== activeTabId"
      :unelevated="tab.id === activeTabId"
      :label="tab.name"
      :data-testid="`tab-chip-${tab.id}`"
      @click="select(tab.id)"
    >
      <slot name="chip-menu" :tab="tab" />
    </q-btn>

    <q-btn
      dense
      flat
      round
      size="sm"
      icon="add"
      data-testid="add-tab"
      @click="emit('add')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Tab } from "@/apps/listies/types";

const props = defineProps<{ tabs: Tab[]; activeTabId: string | null }>();
const emit = defineEmits<{ select: [tabId: string]; add: [] }>();

const orderedTabs = computed(() =>
  [...props.tabs].sort((a, b) => a.order - b.order),
);

function select(tabId: string): void {
  if (tabId === props.activeTabId) return;
  emit("select", tabId);
}
</script>

<style scoped>
/* Anchored at the bottom of the sheet, the way a spreadsheet's sheet tabs are.
   Scrolls sideways once there are more tabs than fit (NFR-1). */
.tab-bar {
  gap: 0.35rem;
  overflow-x: auto;
  padding: 0.5rem 0.25rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.tab-bar__chip {
  flex: 0 0 auto;
}
</style>
