<template>
  <q-page class="qotd-day q-pa-md">
    <div class="row items-center q-mb-md">
      <q-btn
        flat
        round
        icon="arrow_back"
        data-testid="back-history"
        @click="goBack"
      />
      <div class="text-h5 q-ml-sm">Past question</div>
    </div>

    <div v-if="store.error" class="text-negative" data-testid="error">
      {{ store.error }}
    </div>

    <template v-else-if="store.day">
      <div class="text-caption text-grey-6 q-mb-sm" data-testid="day-date">
        {{ formatDate(store.day.date) }}
      </div>
      <div class="text-h6 q-mb-md" data-testid="question-text">
        {{ store.day.question.text }}
      </div>

      <!-- Read-only: no answer form on a past day (Story 2.3 lock). -->
      <div
        v-if="store.day.answers.length === 0"
        class="text-grey-6"
        data-testid="day-empty"
      >
        Nobody answered on this day.
      </div>

      <q-list v-else separator>
        <q-item
          v-for="answer in store.day.answers"
          :key="answer.username"
          :data-testid="`day-answer-${answer.username}`"
        >
          <q-item-section>
            <q-item-label caption>{{ answer.username }}</q-item-label>
            <q-item-label>
              <span v-if="store.day.question.type === 'scale'">
                {{ answer.rating }}
              </span>
              <span v-else>{{ answer.text }}</span>
            </q-item-label>
          </q-item-section>
        </q-item>
      </q-list>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useQotdStore } from "@/apps/question-of-the-day/stores/useQotdStore";

const store = useQotdStore();
const route = useRoute();
const router = useRouter();

onMounted(() => void store.fetchDay(String(route.params.date)));

function goBack(): void {
  void router.push("/question-of-the-day/history");
}

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
