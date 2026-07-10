<template>
  <div class="flashcard hotaru-panel" data-testid="flashcard">
    <!-- Centred content — stays centred whether or not the card is revealed. -->
    <div class="flashcard__body column flex-center">
      <!-- Furigana aid: kana above a kanji headword when the learner opts in. -->
      <div
        v-if="word.kanji && showReading"
        class="flashcard__furigana"
        data-testid="card-furigana"
      >
        {{ word.reading }}
      </div>

      <!-- The practiced Japanese word, brightest on the card, glowing cyan. -->
      <div class="flashcard__jp" data-testid="card-prompt">
        {{ word.kanji ?? word.reading }}
      </div>

      <!-- Reveal side. -->
      <div
        v-if="revealed"
        class="flashcard__answer column flex-center"
        data-testid="card-answer"
      >
        <div v-if="word.kanji && !showReading" class="flashcard__reading">
          {{ word.reading }}
        </div>
        <div v-if="word.romaji && showRomaji" class="flashcard__romaji">
          {{ word.romaji }}
        </div>
        <div class="flashcard__meaning">{{ word.meaning }}</div>
      </div>
    </div>

    <!-- Info pills lined along the card's bottom edge (reveal side). -->
    <div
      v-if="revealed && (word.lesson || word.pos)"
      class="flashcard__pills row"
      data-testid="card-pills"
    >
      <span v-if="word.lesson" class="flashcard__pill">{{ word.lesson }}</span>
      <span v-if="word.pos" class="flashcard__pill">{{ word.pos }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Word } from "@/apps/hotaru/types";

withDefaults(
  defineProps<{
    word: Word;
    revealed: boolean;
    showReading?: boolean;
    showRomaji?: boolean;
  }>(),
  { showReading: false, showRomaji: false },
);
</script>

<style scoped lang="sass">
// Focal drill card — fills its container (most of the screen), glass panel with
// a dual cyan+violet ambient glow. Pills sit absolutely on the bottom edge so
// the word content stays vertically centred.
.flashcard
  position: relative
  display: flex
  flex-direction: column
  flex: 1
  width: 100%
  padding: 28px 22px
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.55), 0 0 40px rgba(155, 107, 255, 0.16), 0 0 40px rgba(56, 240, 230, 0.10)

.flashcard__body
  flex: 1
  gap: 14px
  text-align: center
  justify-content: center

// Furigana line — kana above the kanji, magenta like the reveal reading.
.flashcard__furigana
  font-size: 22px
  color: var(--hotaru-fam-5)
  text-shadow: 0 0 14px rgba(255, 92, 200, 0.45)

// The practiced Japanese word: electric cyan with a strong cyan glow.
.flashcard__jp
  font-size: 60px
  font-weight: 700
  line-height: 1.1
  color: var(--hotaru-bamboo)
  text-shadow: 0 0 32px rgba(56, 240, 230, 0.6), 0 0 16px rgba(56, 240, 230, 0.5)

.flashcard__answer
  gap: 6px
  margin-top: 8px

// Reading line — magenta (per the drill design).
.flashcard__reading
  font-size: 22px
  color: var(--hotaru-fam-5)
  text-shadow: 0 0 16px rgba(255, 92, 200, 0.5)

.flashcard__romaji
  font-size: 15px
  font-style: italic
  color: var(--hotaru-sage)

.flashcard__meaning
  font-size: 20px
  color: var(--hotaru-cream-soft)

// Tiny category-style pills, bottom-left, with a hairline rule above.
.flashcard__pills
  position: absolute
  left: 20px
  right: 20px
  bottom: 14px
  gap: 5px
  flex-wrap: wrap
  padding-top: 10px
  border-top: 1px solid rgba(155, 107, 255, 0.18)

.flashcard__pill
  font-size: 10px
  letter-spacing: 0.02em
  padding: 2px 8px
  border-radius: 9999px
  background: rgba(155, 107, 255, 0.16)
  border: 1px solid rgba(155, 107, 255, 0.34)
  color: #cdc6f0
</style>
