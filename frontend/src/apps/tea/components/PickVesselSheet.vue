<template>
  <div class="sheet" data-testid="vessel-sheet">
    <p class="sheet__title">Brewing in</p>
    <p v-if="vessels.length === 0" class="vessel__empty" data-testid="vessel-empty">
      No gaiwans or pots yet — add them under Teaware.
    </p>
    <ul v-else class="vessel__list">
      <li v-for="item in vessels" :key="item.id">
        <button
          :class="['vessel__row', { 'vessel__row--current': item.id === currentId }]"
          :data-testid="`vessel-${item.id}`"
          @click="emit('pick', item)"
        >
          <span class="vessel__name">{{ item.name }}</span>
          <span class="vessel__meta">{{ wareSummary(item) }}</span>
        </button>
      </li>
    </ul>
    <button v-if="currentId" class="sheet__cancel" data-testid="vessel-none" @click="emit('pick', null)">
      No vessel
    </button>
    <button class="sheet__cancel" data-testid="vessel-close" @click="emit('close')">Done</button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { isBrewingVessel, wareSummary } from "../ware";
import type { Teaware } from "../types";

const props = defineProps<{ items: Teaware[]; currentId: string | null }>();
const emit = defineEmits<{ pick: [item: Teaware | null]; close: [] }>();

const vessels = computed(() =>
  props.items.filter(isBrewingVessel).sort((a, b) => a.name.localeCompare(b.name)),
);
</script>

<style scoped lang="scss">
@import "./timer-sheet.scss";

.vessel__list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  max-height: 42vh;
  overflow-y: auto;
}
.vessel__row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  width: 100%;
  background: transparent;
  border: 0;
  border-bottom: 1px solid #241e19;
  padding: 12px 2px;
  color: #efe7da;
  font-family: inherit;
  font-size: 15px;
  text-align: left;
  cursor: pointer;
}
.vessel__row--current .vessel__name {
  color: #efe7da;
  font-weight: 600;
}
.vessel__name {
  flex: 1;
}
.vessel__meta {
  color: #8b7a63;
  font-size: 13px;
}
.vessel__empty {
  color: #8b7a63;
  font-size: 14px;
}
</style>
