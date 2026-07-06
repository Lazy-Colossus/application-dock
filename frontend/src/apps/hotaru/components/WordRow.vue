<template>
  <div class="word-row row items-center no-wrap" data-testid="word-row">
    <div class="word-row__jp column">
      <span class="word-row__primary">{{ word.kanji ?? word.reading }}</span>
      <span v-if="word.kanji" class="word-row__reading">{{
        word.reading
      }}</span>
    </div>
    <div class="word-row__meaning col">{{ word.meaning }}</div>
  </div>
</template>

<script setup lang="ts">
import type { Word } from "@/apps/hotaru/types";

defineProps<{ word: Word }>();
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

.word-row__meaning
  font-size: 14px
  color: var(--hotaru-cream-soft)
</style>
