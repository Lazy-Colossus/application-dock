<template>
  <q-page class="results-page q-pa-md column no-wrap">
    <!-- Error banner -->
    <q-banner v-if="store.error" class="bg-negative text-white q-mb-md" rounded>
      {{ store.error }}
    </q-banner>

    <!-- Session label -->
    <div class="results-page__label q-mb-md">
      {{ store.session ? formatSessionLabel(store.session.label) : '' }}
    </div>

    <!-- Ranked summary -->
    <div class="column q-gutter-sm q-mb-lg">
      <div
        v-for="(row, i) in rankedArchers"
        :key="row.archer"
        class="results-page__rank-row row items-center q-pa-md"
      >
        <div class="results-page__rank-chip" :class="i === 0 ? 'results-page__rank-chip--first' : ''">
          {{ i + 1 }}
        </div>
        <div class="col results-page__archer-name">{{ row.archer }}</div>
        <div class="results-page__score" :class="i === 0 ? 'results-page__score--first' : ''">
          {{ row.total }}
        </div>
      </div>
    </div>

    <!-- Per-target breakdown -->
    <ResultsTable v-if="store.session" :session="store.session" class="q-mb-lg" />

    <!-- Action buttons -->
    <div class="column q-gutter-sm q-mt-auto">
      <q-btn
        class="full-width"
        label="Finalise Session"
        unelevated
        no-caps
        :disable="store.loading"
        :loading="store.loading"
        style="height: 56px; border-radius: 8px; background: #C8960A; color: #F0F0F0"
        data-testid="finalise-btn"
        @click="finaliseDialogOpen = true"
      />
      <q-btn
        class="full-width"
        label="Return to Scoring"
        outline
        no-caps
        style="height: 56px; border-radius: 8px; color: #F0F0F0"
        data-testid="return-btn"
        @click="router.push('/archery/scoring')"
      />
    </div>

    <!-- Finalise confirm dialog -->
    <q-dialog v-model="finaliseDialogOpen">
      <div class="results-page__dialog q-pa-md">
        <p class="q-mb-xs text-h6">Finalise this session?</p>
        <p class="q-mb-md text-caption text-grey-5">You can't edit it after this.</p>
        <div class="row justify-end q-gutter-sm">
          <q-btn flat label="Cancel" no-caps @click="finaliseDialogOpen = false" />
          <q-btn
            unelevated
            label="Finalise"
            no-caps
            style="background: #C8960A; color: #F0F0F0"
            data-testid="finalise-confirm-btn"
            @click="onFinalise"
          />
        </div>
      </div>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useArcherySessionStore } from '@/apps/archery/stores/useArcherySessionStore';
import { ranked } from '@/apps/archery/composables/useScores';
import { formatSessionLabel } from '@/apps/archery/composables/useSessionLabel';
import ResultsTable from '@/apps/archery/components/ResultsTable.vue';

const store = useArcherySessionStore();
const router = useRouter();
const finaliseDialogOpen = ref(false);

onMounted(() => {
  if (!store.session) void router.replace('/archery');
});

const rankedArchers = computed(() => (store.session ? ranked(store.session) : []));

async function onFinalise(): Promise<void> {
  finaliseDialogOpen.value = false;
  try {
    await store.finaliseSession();
    void router.replace('/archery');
  } catch {
    // error already set in store; stay on page
  }
}
</script>

<style scoped lang="sass">
.results-page__label
  font-family: Roboto, sans-serif
  font-weight: 700
  font-size: 24px
  color: #F0F0F0

.results-page__rank-row
  background: #242424
  border-radius: 12px
  min-height: 72px
  gap: 12px

.results-page__rank-chip
  width: 24px
  height: 24px
  border-radius: 50%
  background: #1E1E1E
  display: flex
  align-items: center
  justify-content: center
  font-family: 'Roboto Mono', monospace
  font-weight: 700
  font-size: 13px
  color: #F0F0F0
  flex-shrink: 0

  &--first
    background: #C8960A

.results-page__archer-name
  font-size: 16px
  color: #F0F0F0

.results-page__score
  font-family: 'Roboto Mono', monospace
  font-weight: 700
  font-size: 20px
  color: #F0F0F0

  &--first
    color: #C8960A

.results-page__dialog
  background: #242424
  border-radius: 8px
  color: #F0F0F0
  min-width: 260px
</style>
