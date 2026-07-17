<template>
  <div class="flashcard hotaru-panel" data-testid="flashcard">
    <!-- Centred content — stays centred whether or not the card is revealed. -->
    <div class="flashcard__body column flex-center">
      <!-- JP→EN (recognition): Japanese prompt → reveal the meaning. -->
      <template v-if="direction === 'r2m'">
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
      </template>

      <!-- EN→JP (production): English prompt → reveal the Japanese to produce. -->
      <template v-else>
        <div class="flashcard__prompt-en" data-testid="card-prompt">
          {{ word.meaning }}
        </div>

        <div
          v-if="revealed"
          class="flashcard__answer column flex-center"
          data-testid="card-answer"
        >
          <div class="flashcard__jp">{{ word.kanji ?? word.reading }}</div>
          <div v-if="word.kanji" class="flashcard__reading">
            {{ word.reading }}
          </div>
          <div v-if="word.romaji && showRomaji" class="flashcard__romaji">
            {{ word.romaji }}
          </div>
        </div>
      </template>
    </div>

    <!-- Partner's shared notes + my own private notes, revealed with the answer
         so a tip lands right when I need it (Story 3.3). Never on the prompt. -->
    <div
      v-if="revealed && notes.length"
      class="flashcard__notes column"
      data-testid="card-notes"
    >
      <div
        v-for="n in notes"
        :key="n.id"
        class="flashcard__note"
        data-testid="card-note"
      >
        <span class="flashcard__note-who">
          <q-icon
            v-if="n.visibility === 'private'"
            name="lock"
            size="12px"
            class="flashcard__note-lock"
          />
          {{ displayName(n) }}
        </span>
        <span class="flashcard__note-text">{{ n.text }}</span>
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
import type { HotaruUser, Note, Word } from "@/apps/hotaru/types";
import { useNoteDisplay } from "@/apps/hotaru/composables/useNoteDisplay";

const props = withDefaults(
  defineProps<{
    word: Word;
    revealed: boolean;
    // "r2m" = JP→EN (Japanese prompt); "m2r" = EN→JP (English prompt, produce JP).
    direction?: "r2m" | "m2r";
    showReading?: boolean;
    showRomaji?: boolean;
    // The word's notes (shared + my own private), shown on reveal (Story 3.3).
    notes?: Note[];
    users?: HotaruUser[];
    activeUser?: string;
  }>(),
  {
    direction: "r2m",
    showReading: false,
    showRomaji: false,
    notes: () => [],
    users: () => [],
    activeUser: undefined,
  },
);

const { displayName } = useNoteDisplay(
  () => props.users,
  () => props.activeUser,
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

// English prompt (EN→JP production): a clear, calm headword — not the cyan JP
// glow, which is reserved for the Japanese being recalled.
.flashcard__prompt-en
  font-size: 34px
  font-weight: 600
  line-height: 1.2
  text-align: center
  color: var(--hotaru-cream)

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

// Notes strip on the reveal side — calm and compact so it never dominates the
// word. Bottom margin clears the absolutely-positioned pills row.
.flashcard__notes
  gap: 6px
  margin: 6px 2px 34px
  padding-top: 10px
  border-top: 1px solid rgba(155, 107, 255, 0.18)
  max-height: 26vh
  overflow-y: auto
  text-align: left

.flashcard__note
  font-size: 13px
  line-height: 1.35

.flashcard__note-who
  display: inline-flex
  align-items: center
  gap: 3px
  font-weight: 600
  color: var(--hotaru-sage)
  margin-right: 6px

.flashcard__note-lock
  color: var(--hotaru-amber-private)

.flashcard__note-text
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
