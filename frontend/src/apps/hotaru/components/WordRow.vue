<template>
  <div
    class="word-row row items-center no-wrap"
    :class="{ 'word-row--selectable': selectable }"
    data-testid="word-row"
    @click="onRowClick"
  >
    <input
      v-if="selectable"
      type="checkbox"
      class="word-row__check"
      :checked="selected"
      tabindex="-1"
      aria-label="Select word"
      data-testid="row-select"
    />
    <div class="word-row__jp column">
      <span
        class="word-row__primary"
        :class="
          word.kanji ? 'word-row__primary--kanji' : 'word-row__primary--kana'
        "
        >{{ word.kanji ?? word.reading }}</span
      >
      <span v-if="word.kanji" class="word-row__reading">{{
        word.reading
      }}</span>
      <span v-if="showRomaji" class="word-row__romaji" data-testid="romaji">{{
        word.romaji
      }}</span>
    </div>
    <div class="word-row__meaning col">{{ word.meaning }}</div>
    <!-- Private mark sits before the familiarity circle so the circles line up
         in a column even in a mixed shared/private list. -->
    <span
      v-if="word.visibility === 'private'"
      class="word-row__private"
      aria-label="Private"
      title="Private"
      data-testid="private-mark"
    >
      <q-icon name="lock" size="17px" />
    </span>
    <FamiliarityIcon :tier="tier" class="word-row__fam" />

    <!-- Disclosure indicator — the whole row body toggles expand (Story 3.5). -->
    <span
      v-if="!selectable"
      class="word-row__chevron"
      :class="{ 'word-row__chevron--open': expanded }"
      data-testid="row-chevron"
    >
      <q-icon
        :name="expanded ? 'keyboard_arrow_up' : 'keyboard_arrow_down'"
        size="20px"
      />
    </span>

    <!-- @click.stop so the actions menu never toggles the row's expand. -->
    <div v-if="!selectable" class="word-row__menu-wrap" @click.stop>
      <button
        class="word-row__action"
        aria-label="Word actions"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        data-testid="row-menu"
        @click="menuOpen = !menuOpen"
      >
        <q-icon name="more_vert" size="18px" />
      </button>
      <template v-if="menuOpen">
        <div class="word-row__menu-backdrop" @click="menuOpen = false" />
        <div class="word-row__menu column" role="menu">
          <button
            class="word-row__menu-item"
            role="menuitem"
            data-testid="romaji-toggle"
            @click="toggleRomaji"
          >
            <q-icon
              :name="showRomaji ? 'visibility_off' : 'visibility'"
              size="16px"
            />
            {{ showRomaji ? "Hide romaji" : "Show romaji" }}
          </button>
          <button
            class="word-row__menu-item"
            role="menuitem"
            data-testid="copy-word"
            @click="copyWord"
          >
            <q-icon name="content_copy" size="16px" />
            Copy
          </button>
          <button
            class="word-row__menu-item"
            role="menuitem"
            data-testid="manage-notes"
            @click="run('notes')"
          >
            <q-icon name="edit_note" size="16px" />
            Notes
          </button>
          <button
            class="word-row__menu-item"
            role="menuitem"
            data-testid="manage-topics"
            @click="run('topics')"
          >
            <q-icon name="sell" size="16px" />
            Topics
          </button>
          <template v-if="editable">
            <button
              class="word-row__menu-item"
              role="menuitem"
              data-testid="edit-word"
              @click="run('edit')"
            >
              <q-icon name="edit" size="16px" />
              Edit
            </button>
            <button
              class="word-row__menu-item word-row__menu-item--danger"
              role="menuitem"
              data-testid="delete-word"
              @click="run('delete')"
            >
              <q-icon name="delete" size="16px" />
              Delete
            </button>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import FamiliarityIcon from "@/apps/hotaru/components/FamiliarityIcon.vue";
import type { Word } from "@/apps/hotaru/types";

// `tier` defaults to 0 (New) — an unreviewed word, or before familiarity loads.
// `selectable` puts the row into bulk-select mode (checkbox, no ⋮ menu).
const props = withDefaults(
  defineProps<{
    word: Word;
    editable?: boolean;
    tier?: number;
    selectable?: boolean;
    selected?: boolean;
    expanded?: boolean;
  }>(),
  {
    editable: false,
    tier: 0,
    selectable: false,
    selected: false,
    expanded: false,
  },
);

const emit = defineEmits<{
  edit: [word: Word];
  delete: [word: Word];
  topics: [word: Word];
  notes: [word: Word];
  "toggle-select": [word: Word];
  "toggle-expand": [word: Word];
}>();

// Select mode: the whole row toggles selection (the checkbox is a bound
// indicator). Normal mode: tapping the row body toggles the inline details
// panel (Story 3.5); the ⋮ menu is @click.stop so it never triggers this.
function onRowClick(): void {
  if (props.selectable) emit("toggle-select", props.word);
  else emit("toggle-expand", props.word);
}

// Per-row romaji visibility (off by default) and the actions overflow menu.
const showRomaji = ref(false);
const menuOpen = ref(false);

function toggleRomaji(): void {
  showRomaji.value = !showRomaji.value;
  menuOpen.value = false;
}

// Copy a readable form of the word to the clipboard.
function copyWord(): void {
  const w = props.word;
  const text = w.kanji
    ? `${w.kanji}（${w.reading}）— ${w.meaning}`
    : `${w.reading} — ${w.meaning}`;
  void navigator.clipboard?.writeText(text)?.catch(() => {});
  menuOpen.value = false;
}

// Emit an action and close the menu — the row keeps only status (familiarity,
// private) visible; everything actionable lives behind the ⋮ button.
function run(action: "edit" | "delete" | "topics" | "notes"): void {
  if (action === "edit") emit("edit", props.word);
  else if (action === "delete") emit("delete", props.word);
  else if (action === "notes") emit("notes", props.word);
  else emit("topics", props.word);
  menuOpen.value = false;
}
</script>

<style scoped lang="sass">
.word-row
  padding: 12px 4px
  border-bottom: 1px solid rgba(155, 107, 255, 0.16)
  gap: 10px
  cursor: pointer

.word-row--selectable
  cursor: pointer

// Disclosure chevron — a quiet status glyph; the whole row is the toggle.
.word-row__chevron
  flex: none
  display: inline-flex
  align-items: center
  color: var(--hotaru-sage)

// Bound indicator only — clicks fall through to the row so the whole row toggles.
.word-row__check
  flex: none
  width: 18px
  height: 18px
  accent-color: var(--hotaru-bamboo)
  pointer-events: none

// Fixed-width JP column so the meaning always starts at the same x — long
// headwords wrap within the column instead of shoving the rest of the row.
// Kept tight (mobile-first) so the meaning gets the bulk of a narrow row.
.word-row__jp
  flex: none
  width: 100px
  overflow-wrap: anywhere

.word-row__primary
  font-size: 20px
  color: var(--hotaru-cream)
  overflow-wrap: anywhere

// Kanji headwords glow electric blue (cyan); kana (hiragana/katakana) glow
// warm yellow — whether a kana-only headword or the reading beneath a kanji.
.word-row__primary--kanji
  color: var(--hotaru-bamboo)
  text-shadow: 0 0 10px rgba(56, 240, 230, 0.4)

.word-row__primary--kana
  color: #ffd24a
  text-shadow: 0 0 10px rgba(255, 210, 74, 0.4)

.word-row__reading
  font-size: 12px
  color: #ffd24a

.word-row__romaji
  font-size: 12px
  font-style: italic
  color: var(--hotaru-sage)

// With only status glyphs + one menu button trailing, the meaning gets the rest
// of the row; `min-width: 0` lets it wrap at word boundaries rather than being
// squeezed into a column of single letters.
.word-row__meaning
  font-size: 14px
  color: var(--hotaru-cream-soft)
  min-width: 0
  overflow-wrap: break-word

.word-row__fam
  flex: none

// Private-scope marker: 🔒 in the amber-private accent. Shared words show
// nothing (shared is the implicit default). Status glyph, not interactive.
.word-row__private
  flex: none
  display: inline-flex
  align-items: center
  color: var(--hotaru-amber-private)

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

.word-row__menu-wrap
  flex: none
  position: relative

// Full-screen catch layer so a click anywhere else closes the menu.
.word-row__menu-backdrop
  position: fixed
  inset: 0
  z-index: 10

.word-row__menu
  position: absolute
  right: 0
  top: calc(100% + 4px)
  z-index: 11
  min-width: 172px
  max-width: calc(100vw - 32px)
  padding: 6px
  border-radius: 12px
  background: rgba(20, 18, 52, 0.97)
  backdrop-filter: blur(16px)
  border: 1px solid rgba(155, 107, 255, 0.28)
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.5)

.word-row__menu-item
  display: flex
  align-items: center
  gap: 10px
  width: 100%
  padding: 8px 10px
  border: none
  border-radius: 8px
  background: transparent
  color: var(--hotaru-cream-soft)
  font-size: 13px
  text-align: left
  cursor: pointer

.word-row__menu-item:hover
  background: rgba(155, 107, 255, 0.14)
  color: var(--hotaru-cream)

.word-row__menu-item--danger
  color: var(--hotaru-fam-5)

.word-row__menu-item--danger:hover
  background: rgba(255, 92, 200, 0.14)
  color: var(--hotaru-fam-5)
</style>
