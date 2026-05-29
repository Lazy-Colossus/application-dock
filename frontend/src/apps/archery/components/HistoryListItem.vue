<template>
  <button
    class="hli row items-center"
    :aria-label="`Session ${displaySessionName(summary)}, ${summary.archer_count} archers, winner ${summary.winner} with ${summary.winning_score} points`"
    @click="emit('tap', summary.label)"
  >
    <div class="col column no-wrap q-py-md q-pl-md">
      <span class="hli__label">{{ displaySessionName(summary) }}</span>
      <span class="hli__sub">
        {{ summary.archer_count }} archers — Winner: {{ summary.winner }} ({{ summary.winning_score }})
      </span>
    </div>
    <q-icon name="chevron_right" class="hli__chevron q-mr-md" />
  </button>
</template>

<script setup lang="ts">
import { displaySessionName } from '@/apps/archery/composables/useSessionLabel';
import type { SessionSummary } from '@/apps/archery/types';

defineProps<{ summary: SessionSummary }>();
const emit = defineEmits<{ (e: 'tap', label: string): void }>();
</script>

<style scoped lang="sass">
.hli
  display: flex
  width: 100%
  background: #242424
  border: none
  border-radius: 8px
  min-height: 72px
  cursor: pointer
  text-align: left

.hli__label
  font-family: Roboto, sans-serif
  font-size: 16px
  font-weight: 400
  color: #F0F0F0
  margin-bottom: 4px

.hli__sub
  font-family: Roboto, sans-serif
  font-size: 12px
  color: #8A8A8A

.hli__chevron
  color: #4A4A4A
  font-size: 20px
  flex-shrink: 0
</style>
