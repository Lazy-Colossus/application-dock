<template>
  <div
    class="study-card hotaru-panel column flex-center"
    data-testid="study-card"
  >
    <!-- Headword: cyan like the drill card, whatever the script. The kana
         variant only steps the size down (kana run longer than kanji). -->
    <div
      class="study-card__jp"
      :class="word.kanji ? 'study-card__jp--kanji' : 'study-card__jp--kana'"
      data-testid="study-headword"
    >
      {{ word.kanji ?? word.reading }}
    </div>

    <!-- Reading (kana) beneath a kanji headword. -->
    <div v-if="word.kanji" class="study-card__reading">{{ word.reading }}</div>

    <div v-if="word.romaji" class="study-card__romaji">{{ word.romaji }}</div>

    <div class="study-card__meaning">{{ word.meaning }}</div>

    <!-- Notes on this word (shared + my own private) — shown inline, no reveal. -->
    <div
      v-if="notes.length"
      class="study-card__notes column"
      data-testid="study-notes"
    >
      <div
        v-for="n in notes"
        :key="n.id"
        class="study-card__note"
        data-testid="study-note"
      >
        <span class="study-card__note-who">
          <q-icon
            v-if="n.visibility === 'private'"
            name="lock"
            size="12px"
            class="study-card__note-lock"
          />
          {{ displayName(n) }}
        </span>
        <span class="study-card__note-text">{{ n.text }}</span>
      </div>
    </div>

    <!-- Info pills (lesson + part of speech) along the bottom edge. -->
    <div
      v-if="word.lesson || word.pos"
      class="study-card__pills row"
      data-testid="study-pills"
    >
      <span v-if="word.lesson" class="study-card__pill">{{ word.lesson }}</span>
      <span v-if="word.pos" class="study-card__pill">{{ word.pos }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HotaruUser, Note, Word } from "@/apps/hotaru/types";
import { useNoteDisplay } from "@/apps/hotaru/composables/useNoteDisplay";

const props = withDefaults(
  defineProps<{
    word: Word;
    notes?: Note[];
    users?: HotaruUser[];
    activeUser?: string;
  }>(),
  { notes: () => [], users: () => [], activeUser: undefined },
);

const { displayName } = useNoteDisplay(
  () => props.users,
  () => props.activeUser,
);
</script>

<style scoped lang="sass">
// Always-revealed, all-fields cousin of the Flashcard — same glass panel + dual
// cyan/violet ambient glow, but everything shown at once (no prompt/reveal).
.study-card
  position: relative
  flex: 1
  width: 100%
  padding: 28px 22px
  gap: 12px
  text-align: center
  justify-content: center
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.55), 0 0 40px rgba(155, 107, 255, 0.16), 0 0 40px rgba(56, 240, 230, 0.10)

.study-card__jp
  font-size: 56px
  font-weight: 700
  line-height: 1.1

// Study shows one word large on a card, so it follows the DRILL card — all
// Japanese in cyan — not the Library list's kanji-cyan/kana-yellow split. The
// script split earns its keep when scanning a column of rows; on a single
// focal word it just makes the same word change colour between surfaces.
.study-card__jp--kanji,
.study-card__jp--kana
  color: var(--hotaru-bamboo)
  text-shadow: 0 0 32px rgba(56, 240, 230, 0.6), 0 0 16px rgba(56, 240, 230, 0.5)

// Kana-only headwords run longer than a compact kanji — size them down a step
// so they don't overwhelm the card (matching Flashcard).
.study-card__jp--kana
  font-size: 50px

.study-card__reading
  font-size: 22px
  color: var(--hotaru-bamboo)
  text-shadow: 0 0 14px rgba(56, 240, 230, 0.4)

.study-card__romaji
  font-size: 15px
  font-style: italic
  color: var(--hotaru-sage)

.study-card__meaning
  font-size: 20px
  color: var(--hotaru-cream-soft)

// Notes strip — calm and compact; bottom margin clears the absolute pills row.
.study-card__notes
  gap: 6px
  margin: 4px 2px 34px
  padding-top: 10px
  border-top: 1px solid rgba(155, 107, 255, 0.18)
  max-height: 26vh
  overflow-y: auto
  text-align: left

.study-card__note
  font-size: 13px
  line-height: 1.35

.study-card__note-who
  display: inline-flex
  align-items: center
  gap: 3px
  font-weight: 600
  color: var(--hotaru-sage)
  margin-right: 6px

.study-card__note-lock
  color: var(--hotaru-amber-private)

.study-card__note-text
  color: var(--hotaru-cream-soft)

.study-card__pills
  position: absolute
  left: 20px
  right: 20px
  bottom: 14px
  gap: 5px
  flex-wrap: wrap
  padding-top: 10px
  border-top: 1px solid rgba(155, 107, 255, 0.18)

.study-card__pill
  font-size: 10px
  letter-spacing: 0.02em
  padding: 2px 8px
  border-radius: 9999px
  background: rgba(155, 107, 255, 0.16)
  border: 1px solid rgba(155, 107, 255, 0.34)
  color: #cdc6f0
</style>
