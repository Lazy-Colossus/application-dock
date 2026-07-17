<template>
  <div class="nc column">
    <textarea
      class="nc-input"
      :class="{ 'nc-input--error': overLimit }"
      :value="text"
      rows="2"
      :placeholder="placeholder"
      aria-describedby="nc-error"
      data-testid="note-text-input"
      @input="emit('update:text', ($event.target as HTMLTextAreaElement).value)"
      @keydown.enter.meta.prevent="onAdd"
      @keydown.enter.ctrl.prevent="onAdd"
    />
    <div class="nc-count row items-center justify-between q-mt-xs">
      <span
        id="nc-error"
        class="nc-count__error"
        role="alert"
        aria-live="polite"
      >
        <span v-if="overLimit" data-testid="note-error">
          Note must be {{ MAX_NOTE_LENGTH }} characters or fewer.
        </span>
      </span>
      <span
        v-if="showCount"
        class="nc-count__num"
        :class="overLimit ? 'nc-count__num--error' : 'nc-count__num--near'"
        data-testid="note-count"
      >
        {{ trimmedLength }}/{{ MAX_NOTE_LENGTH }}
      </span>
    </div>
    <div class="nc-row row items-center justify-between q-mt-sm">
      <div class="nc-vis row no-wrap">
        <button
          class="nc-vis__btn"
          :class="{ 'nc-vis__btn--shared-on': visibility === 'shared' }"
          data-testid="note-vis-shared"
          @click="emit('update:visibility', 'shared')"
        >
          Shared
        </button>
        <button
          class="nc-vis__btn"
          :class="{ 'nc-vis__btn--private-on': visibility === 'private' }"
          data-testid="note-vis-private"
          @click="emit('update:visibility', 'private')"
        >
          <q-icon name="lock" size="13px" /> Private
        </button>
      </div>
      <q-btn
        label="Add"
        no-caps
        unelevated
        :disable="!canAdd"
        data-testid="note-add"
        @click="onAdd"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Visibility } from "@/apps/hotaru/types";

// The shared add-a-note control: a growing textarea, a Shared/Private toggle
// carrying the palette's meaning, and a quiet trimmed-length 300-char guard.
// Controlled (text/visibility owned by the parent) so the parent can reset the
// draft (e.g. when the dialog reopens or the word changes). Used by both
// WordNotesDialog (teleported) and the inline library-row panel — so it
// hardcodes the Neon palette, which resolves everywhere.
const props = withDefaults(
  defineProps<{
    text: string;
    visibility: Visibility;
    placeholder?: string;
  }>(),
  { placeholder: "Add a note…" },
);

const emit = defineEmits<{
  "update:text": [value: string];
  "update:visibility": [value: Visibility];
  add: [text: string, visibility: Visibility];
}>();

// Keep in sync with notes_service.MAX_NOTE_LENGTH (backend enforces the same).
const MAX_NOTE_LENGTH = 300;

// Trimmed length everywhere — the backend validates the trimmed text, so the
// readout, warn threshold, and gate all agree (trailing whitespace never
// makes the counter and the gate disagree).
const trimmedLength = computed(() => props.text.trim().length);
const overLimit = computed(() => trimmedLength.value > MAX_NOTE_LENGTH);
// Quiet until the last stretch — a running tally from keystroke one reads as
// pressure; the count only matters as you approach the cap.
const COUNT_WARN_AT = MAX_NOTE_LENGTH - 40;
const showCount = computed(() => trimmedLength.value >= COUNT_WARN_AT);
const canAdd = computed(() => trimmedLength.value > 0 && !overLimit.value);

function onAdd(): void {
  if (!canAdd.value) return;
  emit("add", props.text.trim(), props.visibility);
}
</script>

<style scoped lang="sass">
.nc-input
  background: rgba(4, 6, 15, 0.5)
  border: 1px solid rgba(155, 107, 255, 0.30)
  border-radius: 10px
  padding: 10px
  color: #f1f0ff
  font-size: 14px
  outline: none
  width: 100%
  resize: vertical
  min-height: 46px
  max-height: 140px
  font-family: inherit
  line-height: 1.4

.nc-input:focus
  border-color: #38f0e6
  box-shadow: 0 0 0 1px rgba(56, 240, 230, 0.4)

.nc-input--error, .nc-input--error:focus
  border-color: #ff6b8a
  box-shadow: 0 0 0 1px rgba(255, 107, 138, 0.4)

.nc-count
  min-height: 16px

.nc-count__num
  font-size: 11px
  color: #b3aede

.nc-count__num--near
  color: #ffce5c

.nc-count__num--error
  color: #ff6b8a

.nc-count__error
  font-size: 12px
  color: #ff6b8a

.nc-vis
  border: 1px solid rgba(155, 107, 255, 0.30)
  border-radius: 9999px
  overflow: hidden

.nc-vis__btn
  border: none
  background: transparent
  color: #b3aede
  padding: 5px 12px
  font-size: 13px
  cursor: pointer

// Shared = violet (implicit default), Private = amber (with the lock) — never
// the cyan CTA hue.
.nc-vis__btn--shared-on
  background: #9b6bff
  color: #0b0620

.nc-vis__btn--private-on
  background: #ffce5c
  color: #2a1e00
</style>
