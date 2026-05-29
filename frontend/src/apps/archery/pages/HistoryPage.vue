<template>
  <q-page class="history-page q-pa-md column no-wrap">
    <!-- Error banner -->
    <q-banner v-if="store.error" dense rounded class="bg-negative text-white q-mb-md">
      Couldn't load history.
      <template #action>
        <q-btn flat no-caps label="Retry" @click="store.loadHistory()" />
      </template>
    </q-banner>

    <!-- Loading -->
    <div v-if="store.loading" class="col flex flex-center">
      <q-spinner color="accent" size="48px" />
    </div>

    <!-- Empty state -->
    <div
      v-else-if="!store.error && store.summaries.length === 0"
      class="col flex flex-center history-page__empty"
    >
      No sessions yet — finish a round to see it here.
    </div>

    <!-- List -->
    <template v-else-if="!store.error">
      <div class="history-page__section-label q-mb-sm">ALL SESSIONS</div>
      <div class="column q-gutter-sm">
        <HistoryListItem
          v-for="s in store.summaries"
          :key="s.label"
          :summary="s"
          @tap="onTap"
        />
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useArcheryHistoryStore } from '@/apps/archery/stores/useArcheryHistoryStore';
import HistoryListItem from '@/apps/archery/components/HistoryListItem.vue';

const store = useArcheryHistoryStore();
const router = useRouter();

onMounted(() => {
  void store.loadHistory();
});

function onTap(label: string): void {
  void router.push(`/archery/history/${encodeURIComponent(label)}`);
}
</script>

<style scoped lang="sass">
.history-page__empty
  font-size: 13px
  color: #8A8A8A
  text-align: center

.history-page__section-label
  font-size: 12px
  color: #8A8A8A
  text-transform: uppercase
  letter-spacing: 0.08em
</style>
