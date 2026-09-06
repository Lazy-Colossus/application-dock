<template>
  <div class="qotd-answer-form q-gutter-sm">
    <!-- Text question: a written response. -->
    <q-input
      v-if="question.type === 'text'"
      v-model="textDraft"
      type="textarea"
      autogrow
      outlined
      label="Your answer"
      data-testid="answer-textarea"
      @keyup.ctrl.enter="onSubmit"
    />

    <!-- Scale question: a rating bounded by the question's min..max, with the
         end labels the question carries. Starts unset so an accidental submit is
         blocked until a value is chosen. -->
    <template v-else>
      <div class="row justify-between text-caption text-grey-7">
        <span data-testid="scale-min-label">{{ minLabel }}</span>
        <span data-testid="scale-max-label">{{ maxLabel }}</span>
      </div>
      <q-slider
        v-model="ratingDraft"
        :min="min"
        :max="max"
        :step="1"
        snap
        markers
        label
        label-always
        data-testid="answer-slider"
      />
    </template>

    <div v-if="error" class="text-negative" data-testid="form-error">
      {{ error }}
    </div>

    <q-btn
      unelevated
      no-caps
      color="primary"
      :label="submitLabel"
      :disable="!canSubmit || loading"
      :loading="loading"
      data-testid="submit-answer"
      @click="onSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Answer, Question } from "@/apps/question-of-the-day/types";

const props = defineProps<{
  question: Question;
  // The caller's saved answer, when they have one — pre-fills the form so
  // editing feels like editing, not re-answering (Story 2.3 builds on this).
  initial: Answer | null;
  loading: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  submit: [payload: { text?: string; rating?: number }];
}>();

const textDraft = ref("");
const ratingDraft = ref<number | null>(null);

// Sync the drafts from the saved answer whenever it changes (initial load and
// after a successful submit).
watch(
  () => props.initial,
  (answer) => {
    textDraft.value = answer?.text ?? "";
    ratingDraft.value = answer?.rating ?? null;
  },
  { immediate: true },
);

const min = computed(() => props.question.scale?.min ?? 0);
const max = computed(() => props.question.scale?.max ?? 0);
const minLabel = computed(
  () => props.question.scale?.min_label ?? String(min.value),
);
const maxLabel = computed(
  () => props.question.scale?.max_label ?? String(max.value),
);

const submitLabel = computed(() => (props.initial ? "Save changes" : "Submit"));

// The server is the source of truth; this only blocks an obvious no-op submit.
const canSubmit = computed(() =>
  props.question.type === "text"
    ? textDraft.value.trim().length > 0
    : ratingDraft.value !== null,
);

function onSubmit(): void {
  if (!canSubmit.value || props.loading) return;
  if (props.question.type === "text") {
    emit("submit", { text: textDraft.value.trim() });
  } else if (ratingDraft.value !== null) {
    emit("submit", { rating: ratingDraft.value });
  }
}
</script>
