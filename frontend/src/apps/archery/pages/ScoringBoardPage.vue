<template>
  <q-page class="scoring-board-page">
    <!-- Subtitle bar -->
    <div class="scoring-board-page__subtitle">
      {{ confirmedCount }} of 18 confirmed
    </div>

    <!-- View Results banner (AC 1: non-blocking; targets remain tappable below) -->
    <div v-if="confirmedCount === 18" class="scoring-board-page__banner row items-center q-px-md">
      <span class="col text-body2" style="color: #F0F0F0">All 18 confirmed</span>
      <q-btn
        unelevated
        no-caps
        label="View Results"
        style="background: #C8960A; color: #F0F0F0; height: 44px; border-radius: 8px"
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

    <!-- Score entry panel stub (Story 2.4 replaces stub content) -->
    <ScoreEntryPanel />
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

onMounted(async () => {
  if (store.session === null) {
    try {
      const s = await store.checkInProgress();
      if (s) {
        store.session = s;
      } else {
        void router.replace('/archery');
      }
    } catch {
      void router.replace('/archery');
    }
  }
});

const confirmedCount = computed(() => store.session?.targets.length ?? 0);

function isConfirmed(n: number): boolean {
  return store.isConfirmed(n);
}
</script>

<style scoped lang="sass">
.scoring-board-page__banner
  background: #2E2000
  border-radius: 8px
  height: 56px
  margin: 8px 16px 0

.scoring-board-page__subtitle
  text-align: center
  font-size: 13px
  color: #8A8A8A
  background: #1A1A1A
  padding: 8px 0

.scoring-board-page__grid
  display: grid
  grid-template-columns: repeat(3, 1fr)
  gap: 8px

  @media (min-width: 768px)
    grid-template-columns: repeat(6, 1fr)
</style>
