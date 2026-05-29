<template>
  <q-page class="history-detail-page q-pa-md column no-wrap">
    <!-- Error state -->
    <template v-if="store.detailError">
      <q-banner dense rounded class="bg-negative text-white q-mb-md" data-testid="error-banner">
        {{ store.detailError }}
      </q-banner>
      <q-btn
        outline
        no-caps
        label="Back to History"
        style="height: 44px; border-radius: 8px; color: #F0F0F0; align-self: flex-start"
        data-testid="back-btn"
        @click="router.push('/archery/history')"
      />
    </template>

    <!-- Loading -->
    <div v-else-if="store.detailLoading" class="col flex flex-center">
      <q-spinner color="accent" size="48px" />
    </div>

    <!-- Content -->
    <template v-else-if="store.detail">
      <!-- Session name heading -->
      <div class="history-detail-page__label q-mb-md">
        {{ displaySessionName(store.detail) }}
      </div>

      <!-- Ranked summary cards -->
      <div class="column q-gutter-sm q-mb-lg">
        <div
          v-for="(row, i) in rankedArchers"
          :key="row.archer"
          class="history-detail-page__rank-row row items-center q-pa-md"
        >
          <div
            class="history-detail-page__rank-chip"
            :class="i === 0 ? 'history-detail-page__rank-chip--first' : ''"
          >
            {{ i + 1 }}
          </div>
          <div class="col history-detail-page__archer-name">{{ row.archer }}</div>
          <div
            class="history-detail-page__score"
            :class="i === 0 ? 'history-detail-page__score--first' : ''"
          >
            {{ row.total }}
          </div>
        </div>
      </div>

      <!-- Per-target breakdown (shared component) -->
      <ResultsTable :session="store.detail" />
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useArcheryHistoryStore } from '@/apps/archery/stores/useArcheryHistoryStore';
import { ranked } from '@/apps/archery/composables/useScores';
import { displaySessionName } from '@/apps/archery/composables/useSessionLabel';
import ResultsTable from '@/apps/archery/components/ResultsTable.vue';

const route = useRoute();
const router = useRouter();
const store = useArcheryHistoryStore();

onMounted(() => {
  const label = route.params.label as string;
  void store.loadDetail(label);
});

const rankedArchers = computed(() => (store.detail ? ranked(store.detail) : []));
</script>

<style scoped lang="sass">
.history-detail-page__label
  font-family: Roboto, sans-serif
  font-weight: 700
  font-size: 24px
  color: #F0F0F0

.history-detail-page__rank-row
  background: #242424
  border-radius: 12px
  min-height: 72px
  gap: 12px

.history-detail-page__rank-chip
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

.history-detail-page__archer-name
  font-size: 16px
  color: #F0F0F0

.history-detail-page__score
  font-family: 'Roboto Mono', monospace
  font-weight: 700
  font-size: 20px
  color: #F0F0F0

  &--first
    color: #C8960A
</style>
