<template>
  <q-bottom-sheet
    v-model="store.scoreEntryOpen"
    :no-backdrop-dismiss="hasAnyEntry"
    :transition-show="prefersReducedMotion ? 'none' : undefined"
    :transition-hide="prefersReducedMotion ? 'none' : undefined"
  >
    <div class="sep q-pa-md">
      <!-- Drag handle -->
      <div class="sep__handle" />

      <!-- Header -->
      <div class="row items-center q-mb-md">
        <div class="col text-center sep__title">
          Target {{ store.activeTargetNumber }}
        </div>
        <q-btn
          flat round dense icon="close"
          class="sep__close"
          aria-label="Close"
          @click="requestClose"
        />
      </div>

      <!-- Archer progress chips -->
      <div class="row justify-center q-gutter-sm q-mb-md">
        <div
          v-for="(name, i) in roster"
          :key="name"
          class="sep__archer-chip"
          :class="{ 'sep__archer-chip--active': i === archerIndex }"
        >
          {{ name }}
        </div>
      </div>

      <!-- Active archer label + sub-label -->
      <div class="text-center q-mb-xs sep__archer-name">{{ currentArcher }}</div>
      <div class="text-center sep__shot-label q-mb-md">Shot {{ shotIndex + 1 }} of 2</div>

      <!-- Shot slot indicators -->
      <div class="row justify-center q-gutter-sm q-mb-md">
        <div
          class="sep__slot"
          :class="{ 'sep__slot--active': shotIndex === 0, 'sep__slot--filled': currentEntry[0] !== null }"
        >
          {{ currentEntry[0] !== null ? currentEntry[0] : '' }}
        </div>
        <div
          class="sep__slot"
          :class="{ 'sep__slot--active': shotIndex === 1, 'sep__slot--filled': currentEntry[1] !== null }"
        >
          {{ currentEntry[1] !== null ? currentEntry[1] : '' }}
        </div>
      </div>

      <!-- Back link -->
      <div v-if="canGoBack" class="text-center q-mb-md">
        <button class="sep__back-link" @click="onBack">← Back to {{ backTargetName }}</button>
      </div>

      <!-- Shot button grid -->
      <div class="sep__grid q-mb-md">
        <ShotButton v-for="v in SHOT_VALUES" :key="v" :value="v" @tap="onShotTap" />
        <div /><!-- 6th cell spacer -->
      </div>

      <!-- Confirm button -->
      <q-btn
        class="full-width sep__confirm"
        label="Confirm Target"
        unelevated
        no-caps
        :disable="!allComplete || store.loading"
        :loading="store.loading"
        data-testid="confirm-btn"
        @click="onConfirm"
      />
    </div>
  </q-bottom-sheet>

  <!-- Discard guard dialog (outside sheet to avoid z-index nesting) -->
  <q-dialog v-model="discardGuardOpen">
    <div class="sep__discard-dialog q-pa-md">
      <p class="q-mb-md">Discard entry?</p>
      <div class="row q-gutter-sm justify-end">
        <q-btn flat label="Cancel" no-caps @click="discardGuardOpen = false" />
        <q-btn flat label="Discard" no-caps data-testid="discard-confirm-btn" @click="forceClose" />
      </div>
    </div>
  </q-dialog>
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

// Panel-local state — not committed to store until Confirm Target
const entries = ref<Record<string, [number | null, number | null]>>({});
const archerIndex = ref(0);
const shotIndex = ref(0);
const discardGuardOpen = ref(false);

const roster = computed(() => store.session?.archers ?? []);

const currentArcher = computed(() => roster.value[archerIndex.value] ?? '');

const currentEntry = computed<[number | null, number | null]>(() => {
  return entries.value[currentArcher.value] ?? [null, null];
});

const hasAnyEntry = computed(() =>
  Object.values(entries.value).some(([s1, s2]) => s1 !== null || s2 !== null)
);

const allComplete = computed(
  () =>
    roster.value.length > 0 &&
    roster.value.every((name) => {
      const e = entries.value[name];
      return e && e[0] !== null && e[1] !== null;
    })
);

const canGoBack = computed(() => archerIndex.value > 0 || shotIndex.value > 0);

const backTargetName = computed(() =>
  shotIndex.value === 0 ? roster.value[archerIndex.value - 1] : roster.value[archerIndex.value]
);

function initEntries(): void {
  archerIndex.value = 0;
  shotIndex.value = 0;
  const existing =
    store.activeTargetNumber !== null ? store.targetByNumber(store.activeTargetNumber) : null;
  const init: Record<string, [number | null, number | null]> = {};
  for (const name of roster.value) {
    const prior = existing?.scores[name];
    init[name] = prior ? ([prior[0], prior[1]] as [number, number]) : [null, null];
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

function onShotTap(value: number): void {
  const archer = currentArcher.value;
  if (!archer) return;
  const entry = entries.value[archer] ?? [null, null];
  if (shotIndex.value === 0) {
    entries.value = { ...entries.value, [archer]: [value, entry[1]] };
    shotIndex.value = 1;
  } else {
    entries.value = { ...entries.value, [archer]: [entry[0], value] };
    if (archerIndex.value < roster.value.length - 1) {
      archerIndex.value++;
      shotIndex.value = 0;
    }
  }
}

function onBack(): void {
  if (shotIndex.value === 1) {
    shotIndex.value = 0;
  } else if (archerIndex.value > 0) {
    archerIndex.value--;
    shotIndex.value = 1;
  }
}

async function onConfirm(): Promise<void> {
  const n = store.activeTargetNumber;
  if (n === null) return;
  const scores: Record<string, [number, number]> = {};
  for (const name of roster.value) {
    const e = entries.value[name];
    if (e && e[0] !== null && e[1] !== null) {
      scores[name] = [e[0], e[1]];
    }
  }
  const target: TargetScores = { number: n, scores };
  try {
    await store.saveTarget(target);
    store.closeTarget();
  } catch {
    // error is surfaced via store.error on ScoringBoardPage
  }
}

function requestClose(): void {
  if (hasAnyEntry.value) {
    discardGuardOpen.value = true;
  } else {
    store.closeTarget();
  }
}

function forceClose(): void {
  discardGuardOpen.value = false;
  store.closeTarget();
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

  &--active
    border-color: #C8960A

  &--filled
    background: #C8960A
    border-color: #C8960A

.sep__back-link
  background: none
  border: none
  font-size: 12px
  color: #8A8A8A
  cursor: pointer
  padding: 4px 8px

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

.sep__discard-dialog
  background: #242424
  border-radius: 8px
  color: #F0F0F0
  min-width: 240px
</style>
