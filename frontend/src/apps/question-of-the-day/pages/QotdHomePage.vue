<template>
  <q-page class="qotd-home q-pa-md">
    <div class="row items-center justify-between q-mb-sm">
      <div class="text-h5">Question of the Day</div>
      <q-btn
        flat
        no-caps
        icon="history"
        label="Past questions"
        data-testid="history-link"
        @click="goToHistory"
      />
    </div>

    <div v-if="store.error" class="text-negative q-mb-md" data-testid="error">
      {{ store.error }}
    </div>

    <template v-else-if="store.today">
      <div class="text-caption text-grey-6 q-mb-md" data-testid="today-date">
        {{ formattedDate }}
      </div>

      <div class="text-h6 q-mb-md" data-testid="question-text">
        {{ store.today.question.text }}
      </div>

      <AnswerForm
        :question="store.today.question"
        :initial="store.today.my_answer"
        :loading="store.loading"
        :error="store.error"
        @submit="onSubmit"
      />

      <TodayFeed
        :feed="store.feed"
        :question-type="store.today.question.type"
      />
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import AnswerForm from "@/apps/question-of-the-day/components/AnswerForm.vue";
import TodayFeed from "@/apps/question-of-the-day/components/TodayFeed.vue";
import { useQotdStore } from "@/apps/question-of-the-day/stores/useQotdStore";

const store = useQotdStore();
const router = useRouter();

onMounted(() => {
  void store.fetchToday();
  void store.fetchFeed();
});

function goToHistory(): void {
  void router.push("/question-of-the-day/history");
}

// Render the server's date string as-is, building the Date from its parts so no
// timezone shift moves it a day (the boundary is the server's, never the
// browser's).
const formattedDate = computed(() => {
  const iso = store.today?.date;
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
});

async function onSubmit(payload: {
  text?: string;
  rating?: number;
}): Promise<void> {
  try {
    await store.submitAnswer(payload);
  } catch {
    // submitAnswer already routed the message into store.error; the form keeps
    // the user's input so they can retry.
  }
}
</script>
