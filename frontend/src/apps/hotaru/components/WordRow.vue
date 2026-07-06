<template>
  <div class="word-row row items-center no-wrap" data-testid="word-row">
    <div class="word-row__jp column">
      <span class="word-row__primary">{{ word.kanji ?? word.reading }}</span>
      <span v-if="word.kanji" class="word-row__reading">{{
        word.reading
      }}</span>
      <span v-if="showRomaji" class="word-row__romaji" data-testid="romaji">{{
        word.romaji
      }}</span>
    </div>
    <div class="word-row__meaning col">{{ word.meaning }}</div>
    <button
      class="word-row__romaji-toggle"
      :class="{ 'word-row__romaji-toggle--on': showRomaji }"
      :aria-pressed="showRomaji"
      :aria-label="showRomaji ? 'Hide romaji' : 'Show romaji'"
      data-testid="romaji-toggle"
      @click="showRomaji = !showRomaji"
    >
      A
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { Word } from "@/apps/hotaru/types";

defineProps<{ word: Word }>();

// Per-row romaji visibility — off by default so the list stays clean.
const showRomaji = ref(false);
</script>

<style scoped lang="sass">
.word-row
  padding: 12px 4px
  border-bottom: 1px solid rgba(140, 175, 93, 0.18)
  gap: 14px

.word-row__jp
  min-width: 96px

.word-row__primary
  font-size: 20px
  color: var(--hotaru-cream)

.word-row__reading
  font-size: 12px
  color: var(--hotaru-sage)

.word-row__romaji
  font-size: 12px
  font-style: italic
  color: var(--hotaru-sage)

.word-row__meaning
  font-size: 14px
  color: var(--hotaru-cream-soft)

.word-row__romaji-toggle
  flex: none
  width: 28px
  height: 28px
  border-radius: 9999px
  border: 1px solid rgba(140, 175, 93, 0.34)
  background: transparent
  color: var(--hotaru-sage)
  font-size: 13px
  cursor: pointer

.word-row__romaji-toggle--on
  background: var(--hotaru-bamboo)
  color: var(--hotaru-bamboo-on)
  border-color: var(--hotaru-bamboo)
</style>
