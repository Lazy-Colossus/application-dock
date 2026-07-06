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
    <span
      v-if="word.visibility === 'private'"
      class="word-row__private"
      aria-label="Private"
      title="Private"
      data-testid="private-mark"
    >
      <q-icon name="lock" size="17px" />
    </span>
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
    <template v-if="editable">
      <button
        class="word-row__action"
        aria-label="Edit word"
        data-testid="edit-word"
        @click="emit('edit', word)"
      >
        <q-icon name="edit" size="18px" />
      </button>
      <button
        class="word-row__action"
        aria-label="Delete word"
        data-testid="delete-word"
        @click="emit('delete', word)"
      >
        <q-icon name="delete" size="18px" />
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { Word } from "@/apps/hotaru/types";

withDefaults(defineProps<{ word: Word; editable?: boolean }>(), {
  editable: false,
});

const emit = defineEmits<{
  edit: [word: Word];
  delete: [word: Word];
}>();

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

// Private-scope marker: 🔒 in the amber-private accent. Shared words show
// nothing (shared is the implicit default). Status glyph, not interactive.
.word-row__private
  flex: none
  display: inline-flex
  align-items: center
  color: var(--hotaru-amber-private)

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

.word-row__action
  flex: none
  width: 28px
  height: 28px
  display: inline-flex
  align-items: center
  justify-content: center
  border-radius: 9999px
  border: none
  background: transparent
  color: var(--hotaru-sage)
  cursor: pointer
</style>
