<template>
  <q-bottom-sheet
    v-model="store.scoreEntryOpen"
    :no-backdrop-dismiss="true"
    :transition-show="prefersReducedMotion ? 'none' : undefined"
    :transition-hide="prefersReducedMotion ? 'none' : undefined"
  >
    <div class="sep q-pa-md">
      <!-- Drag handle -->
      <div class="sep__handle" />

      <!-- Header -->
      <div class="row items-center q-mb-md">
        <div class="col text-center sep__title">Target {{ store.activeTargetNumber }}</div>
        <q-btn
          flat
          round
          dense
          icon="close"
          class="sep__close"
          aria-label="Close"
          data-testid="close-btn"
          @click="onClose"
        />
      </div>

      <!-- Archer chips — tap to jump to that archer (Story 7.4) -->
      <div class="row justify-center q-gutter-sm q-mb-md">
        <button
          v-for="(name, i) in roster"
          :key="name"
          type="button"
          class="sep__archer-chip"
          :class="{ 'sep__archer-chip--active': i === archerIndex }"
          data-testid="archer-chip"
          @click="selectArcher(i)"
        >
          {{ name }}
        </button>
      </div>

      <!-- Active archer label + sub-label -->
      <div class="text-center q-mb-xs sep__archer-name">{{ currentArcher }}</div>
      <div class="text-center sep__shot-label q-mb-md">Shot {{ shotIndex + 1 }} of 2</div>

      <!-- Shot slots — tap to choose which slot the next value fills (Story 7.4) -->
      <div class="row justify-center q-gutter-sm q-mb-md">
        <button
          type="button"
          class="sep__slot"
          :class="{ 'sep__slot--active': shotIndex === 0, 'sep__slot--filled': currentEntry[0] !== null }"
          data-testid="slot-0"
          @click="selectSlot(0)"
        >
          {{ currentEntry[0] !== null ? currentEntry[0] : '' }}
        </button>
        <button
          type="button"
          class="sep__slot"
          :class="{ 'sep__slot--active': shotIndex === 1, 'sep__slot--filled': currentEntry[1] !== null }"
          data-testid="slot-1"
          @click="selectSlot(1)"
        >
          {{ currentEntry[1] !== null ? currentEntry[1] : '' }}
        </button>
      </div>

      <!-- Shot button grid -->
      <div class="sep__grid q-mb-md">
        <ShotButton v-for="v in SHOT_VALUES" :key="v" :value="v" @tap="onShotTap" />
        <div /><!-- 6th cell spacer -->
      </div>

      <!-- Confirm button — always enabled; empty shots saved as 0 (Story 7.3) -->
      <q-btn
        class="full-width sep__confirm"
        label="Confirm Target"
        unelevated
        no-caps
        :disable="store.loading"
        :loading="store.loading"
        data-testid="confirm-btn"
        @click="onConfirm"
      />
    </div>
  </q-bottom-sheet>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useArcherySessionStore } from '@/apps/archery/stores/useArcherySessionStore';
import ShotButton from '@/apps/archery/components/ShotButton.vue';
import type { TargetScores } from '@/apps/archery/types';

const SHOT_VALUES = [0, 5, 8, 10, 11] as const;

const store = useArcherySessionStore();

const prefersReducedMotion =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

// Panel-local entry state — committed to the store on close or confirm.
const entries = ref<Record<string, [number | null, number | null]>>({});
const archerIndex = ref(0);
const shotIndex = ref(0);

const roster = computed(() => store.session?.archers ?? []);
const currentArcher = computed(() => roster.value[archerIndex.value] ?? '');
const currentEntry = computed<[number | null, number | null]>(
  () => entries.value[currentArcher.value] ?? [null, null]
);

const hasAnyEntry = computed(() =>
  Object.values(entries.value).some(([s1, s2]) => s1 !== null || s2 !== null)
);

function initEntries(): void {
  archerIndex.value = 0;
  shotIndex.value = 0;
  const existing =
    store.activeTargetNumber !== null ? store.targetByNumber(store.activeTargetNumber) : null;
  const init: Record<string, [number | null, number | null]> = {};
  for (const name of roster.value) {
    const prior = existing?.scores[name];
    init[name] = prior ? [prior[0], prior[1]] : [null, null];
  }
  entries.value = init;
}

watch(
  () => store.scoreEntryOpen,
  (open) => {
    if (open) initEntries();
  },
  { immediate: true }
);

watch(
  () => store.activeTargetNumber,
  () => {
    if (store.scoreEntryOpen) initEntries();
  }
);

function selectArcher(i: number): void {
  archerIndex.value = i;
  const e = entries.value[roster.value[i]] ?? [null, null];
  // Land on the first empty slot for quick entry; default to slot 0.
  shotIndex.value = e[0] === null ? 0 : e[1] === null ? 1 : 0;
}

function selectSlot(j: 0 | 1): void {
  shotIndex.value = j;
}

function onShotTap(value: number): void {
  const archer = currentArcher.value;
  if (!archer) return;
  const entry = entries.value[archer] ?? [null, null];
  const next: [number | null, number | null] = [entry[0], entry[1]];
  next[shotIndex.value] = value;
  entries.value = { ...entries.value, [archer]: next };

  // Auto-advance for fast sequential entry; manual chip/slot taps override.
  if (shotIndex.value === 0) {
    shotIndex.value = 1;
  } else if (archerIndex.value < roster.value.length - 1) {
    archerIndex.value++;
    shotIndex.value = 0;
  }
}

async function onConfirm(): Promise<void> {
  const n = store.activeTargetNumber;
  if (n === null) return;
  const scores: Record<string, [number, number]> = {};
  for (const name of roster.value) {
    const e = entries.value[name] ?? [null, null];
    scores[name] = [e[0] ?? 0, e[1] ?? 0];
  }
  const target: TargetScores = { number: n, scores, confirmed: true };
  try {
    await store.saveTarget(target);
    store.closeTarget();
  } catch {
    // error surfaced via store.error on ScoringBoardPage; entries kept
  }
}

async function onClose(): Promise<void> {
  const n = store.activeTargetNumber;
  // Nothing entered → nothing to persist.
  if (n === null || !hasAnyEntry.value) {
    store.closeTarget();
    return;
  }
  // Save the partial entry as-is (nulls preserved), unconfirmed (Story 7.2).
  const scores: Record<string, [number | null, number | null]> = {};
  for (const name of roster.value) {
    const e = entries.value[name] ?? [null, null];
    scores[name] = [e[0], e[1]];
  }
  const target: TargetScores = { number: n, scores, confirmed: false };
  try {
    await store.saveTarget(target);
    store.closeTarget();
  } catch {
    // error surfaced via store.error on ScoringBoardPage; entries kept, drawer stays open
  }
}
</script>

<style scoped lang="sass">
.sep
  background: #1E1E1E
  border-radius: 16px 16px 0 0

.sep__handle
  width: 32px
  height: 4px
  background: #2A2A2A
  border-radius: 2px
  margin: 0 auto 16px

.sep__title
  font-family: Roboto, sans-serif
  font-weight: 700
  font-size: 20px
  color: #F0F0F0

.sep__close
  color: #8A8A8A

.sep__archer-chip
  background: #242424
  border-radius: 8px
  padding: 4px 12px
  font-size: 13px
  color: #8A8A8A
  border: 1px solid transparent
  cursor: pointer

  &--active
    border-color: #C8960A
    color: #F0F0F0

.sep__archer-name
  font-size: 16px
  font-weight: 500
  color: #F0F0F0

.sep__shot-label
  font-size: 12px
  color: #8A8A8A

.sep__slot
  width: 40px
  height: 40px
  border-radius: 50%
  border: 1.5px solid #4A4A4A
  display: flex
  align-items: center
  justify-content: center
  font-family: 'Roboto Mono', monospace
  font-weight: 700
  font-size: 16px
  color: #F0F0F0
  background: transparent
  cursor: pointer

  &--active
    border-color: #C8960A

  &--filled
    background: #C8960A
    border-color: #C8960A

.sep__grid
  display: grid
  grid-template-columns: repeat(3, 1fr)
  gap: 8px

.sep__confirm
  height: 56px
  border-radius: 8px
  background: #C8960A
  color: #F0F0F0
  font-size: 16px
</style>
