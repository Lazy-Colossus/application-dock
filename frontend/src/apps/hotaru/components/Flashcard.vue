<template>
  <div
    class="flashcard hotaru-panel column flex-center"
    data-testid="flashcard"
  >
    <div class="flashcard__label">Prompt</div>

    <!-- Prompt side (JP→EN): the Japanese headword, brightest on the card. -->
    <div
      class="flashcard__jp"
      :class="word.kanji ? 'flashcard__jp--kanji' : 'flashcard__jp--kana'"
      data-testid="card-prompt"
    >
      {{ word.kanji ?? word.reading }}
    </div>

    <!-- Reveal side. -->
    <div
      v-if="revealed"
      class="flashcard__answer column flex-center"
      data-testid="card-answer"
    >
      <div v-if="word.kanji" class="flashcard__reading">{{ word.reading }}</div>
      <div v-if="word.romaji" class="flashcard__romaji">{{ word.romaji }}</div>
      <div class="flashcard__meaning">{{ word.meaning }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Word } from "@/apps/hotaru/types";

defineProps<{ word: Word; revealed: boolean }>();
</script>

<style scoped lang="sass">
.flashcard
  gap: 12px
  padding: 32px 20px
  min-height: 260px
  text-align: center
  // Focal drill card: the glass panel plus a dual cyan+violet ambient glow.
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.55), 0 0 40px rgba(155, 107, 255, 0.16), 0 0 40px rgba(56, 240, 230, 0.10)

.flashcard__label
  font-size: 11px
  letter-spacing: 0.18em
  text-transform: uppercase
  color: var(--hotaru-sage)

// Kanji headword glows cyan; kana headword glows lamp-yellow (per DESIGN).
.flashcard__jp
  font-size: 46px
  font-weight: 700
  line-height: 1.1

.flashcard__jp--kanji
  color: var(--hotaru-bamboo)
  text-shadow: 0 0 30px rgba(56, 240, 230, 0.6), 0 0 14px rgba(56, 240, 230, 0.5)

.flashcard__jp--kana
  color: var(--hotaru-lamp-yellow, #ffd24a)
  text-shadow: 0 0 26px rgba(255, 210, 74, 0.55), 0 0 10px rgba(255, 224, 130, 0.5)

.flashcard__answer
  gap: 4px
  margin-top: 4px

// The reading line is kana → lamp-yellow.
.flashcard__reading
  font-size: 20px
  color: var(--hotaru-lamp-yellow, #ffd24a)

.flashcard__romaji
  font-size: 14px
  font-style: italic
  color: var(--hotaru-sage)

.flashcard__meaning
  font-size: 18px
  color: var(--hotaru-cream)
</style>
