<template>
  <q-page class="scoring-board-page">
    <!-- Top bar: confirmed count + persistent View Results (Story 7.5, FR-7.6) -->
    <div class="scoring-board-page__topbar row items-center q-px-md">
      <span class="col scoring-board-page__count">
        {{ confirmedCount }} of 18 confirmed
        <span v-if="confirmedCount === 18" class="scoring-board-page__all-done"> · all done ✓</span>
      </span>
      <q-btn
        flat
        dense
        no-caps
        label="View Results"
        class="scoring-board-page__results-link"
        data-testid="view-results-btn"
        @click="router.push('/archery/results')"
      />
    </div>

    <!-- Save error banner -->
    <q-banner
      v-if="store.error"
      dense
      rounded
      class="scoring-board-page__error-banner q-mx-md q-mt-sm"
      data-testid="save-error-banner"
    >
      {{ store.error }}
      <template #action>
        <q-btn
          flat
          no-caps
          label="Retry"
          data-testid="save-retry-btn"
          @click="store.error = null; store.scoreEntryOpen = true"
        />
      </template>
    </q-banner>

    <!-- Target grid -->
    <div class="scoring-board-page__grid q-px-md q-pt-md">
      <TargetIcon
        v-for="n in 18"
        :key="n"
        :number="n"
        :confirmed="isConfirmed(n)"
        @tap="store.openTarget(n)"
      />
    </div>

    <!-- Archer chips strip (read-only, no remove X) -->
    <div class="scoring-board-page__archers q-px-md q-pt-md row wrap q-gutter-sm">
      <ArcherChip
        v-for="name in store.session?.archers ?? []"
        :key="name"
        :name="name"
        :removable="false"
      />
    </div>

    <ScoreEntryPanel />

    <!-- Bottom-anchored primary action within thumb reach (Story 7.5, FR-7.5) -->
    <div class="scoring-board-page__footer q-px-md">
      <q-btn
        class="full-width scoring-board-page__done-btn"
        unelevated
        no-caps
        label="View Results"
        data-testid="view-results-bottom-btn"
        @click="router.push('/archery/results')"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useArcherySessionStore } from '@/apps/archery/stores/useArcherySessionStore';
import TargetIcon from '@/apps/archery/components/TargetIcon.vue';
import ArcherChip from '@/apps/archery/components/ArcherChip.vue';
import ScoreEntryPanel from '@/apps/archery/components/ScoreEntryPanel.vue';

const store = useArcherySessionStore();
const router = useRouter();

onMounted(() => {
  // With multiple concurrent sessions, the board can only render the session
  // already loaded into the store (via create or resume). If none is loaded,
  // there is nothing to disambiguate here — send the operator home to pick one.
  if (store.session === null) {
    void router.replace('/archery');
  }
});

const confirmedCount = computed(
  () => store.session?.targets.filter((t) => t.confirmed === true).length ?? 0
);

function isConfirmed(n: number): boolean {
  return store.isConfirmed(n);
}
</script>

<style scoped lang="sass">
.scoring-board-page__topbar
  font-size: 13px
  color: #8A8A8A
  background: #1A1A1A
  min-height: 44px

.scoring-board-page__count
  text-align: left

.scoring-board-page__all-done
  color: #2E7D32

.scoring-board-page__results-link
  color: #C8960A
  min-height: 44px

.scoring-board-page__grid
  display: grid
  grid-template-columns: repeat(3, 1fr)
  gap: 8px

  @media (min-width: 768px)
    grid-template-columns: repeat(6, 1fr)

// Reserve space so the sticky footer never covers the last row of targets.
.scoring-board-page__archers
  padding-bottom: 88px

.scoring-board-page__footer
  position: sticky
  bottom: 0
  padding-top: 8px
  padding-bottom: max(8px, env(safe-area-inset-bottom))
  background: #121212

.scoring-board-page__done-btn
  height: 56px
  border-radius: 8px
  background: #C8960A
  color: #F0F0F0
  font-size: 16px
</style>
