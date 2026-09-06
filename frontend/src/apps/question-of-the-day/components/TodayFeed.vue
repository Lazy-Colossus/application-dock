<template>
  <div v-if="feed" class="qotd-feed q-mt-lg">
    <!-- Withheld until the caller answers (answer-to-reveal). A count teaser is
         allowed, never any contents. -->
    <div v-if="!feed.revealed" class="text-grey-6" data-testid="feed-locked">
      Answer to reveal everyone's responses.
      <span v-if="feed.count > 0" data-testid="feed-teaser">
        {{ feed.count }}
        {{ feed.count === 1 ? "person has" : "people have" }} answered so far.
      </span>
    </div>

    <template v-else>
      <div class="text-subtitle2 q-mb-sm" data-testid="feed-heading">
        Everyone's answers
      </div>

      <div
        v-if="feed.answers.length === 0"
        class="text-grey-6"
        data-testid="feed-empty"
      >
        Nobody else has answered yet.
      </div>

      <q-list v-else separator>
        <q-item
          v-for="answer in feed.answers"
          :key="answer.username"
          :data-testid="`feed-answer-${answer.username}`"
        >
          <q-item-section>
            <q-item-label
              caption
              :data-testid="`feed-author-${answer.username}`"
            >
              {{ answer.username }}
            </q-item-label>
            <q-item-label>
              <span v-if="questionType === 'scale'">{{ answer.rating }}</span>
              <span v-else>{{ answer.text }}</span>
            </q-item-label>
          </q-item-section>
        </q-item>
      </q-list>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { QuestionType, TodayFeed } from "@/apps/question-of-the-day/types";

defineProps<{
  feed: TodayFeed | null;
  questionType: QuestionType;
}>();
</script>
