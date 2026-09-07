<template>
  <q-page class="qotd-history q-pa-md">
    <div class="row items-center q-mb-md">
      <q-btn
        flat
        round
        icon="arrow_back"
        data-testid="back-home"
        @click="goHome"
      />
      <div class="text-h5 q-ml-sm">Past questions</div>
    </div>

    <div v-if="store.error" class="text-negative" data-testid="error">
      {{ store.error }}
    </div>

    <div
      v-else-if="!store.loading && store.history.length === 0"
      class="text-grey-6"
      data-testid="empty-state"
    >
      No past questions yet — check back tomorrow.
    </div>

    <q-list v-else separator>
      <q-item
        v-for="row in store.history"
        :key="row.date"
        clickable
        :data-testid="`history-${row.date}`"
        @click="open(row.date)"
      >
        <q-item-section>
          <q-item-label>{{ row.question_text }}</q-item-label>
          <q-item-label caption>{{ formatDate(row.date) }}</q-item-label>
        </q-item-section>
        <q-item-section side>
          <q-icon name="chevron_right" />
        </q-item-section>
      </q-item>
    </q-list>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { useQotdStore } from "@/apps/question-of-the-day/stores/useQotdStore";

const store = useQotdStore();
const router = useRouter();

onMounted(() => void store.fetchHistory());

function open(date: string): void {
  void router.push(`/question-of-the-day/days/${date}`);
}

function goHome(): void {
  void router.push("/question-of-the-day");
}

// Render the server's date string from its parts so no timezone shift moves it.
function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
</script>
