<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="wn-dialog" data-testid="notes-dialog">
      <div class="wn-header">
        <span class="wn-header__eyebrow">Notes</span>
        <span class="wn-header__word">{{ word.kanji ?? word.reading }}</span>
      </div>

      <div v-if="ordered.length === 0" class="wn-empty">
        No notes yet — leave the first tip below.
      </div>
      <div v-else class="wn-list" data-testid="notes-list">
        <div
          v-for="n in ordered"
          :key="n.id"
          class="wn-note"
          data-testid="note-item"
        >
          <div class="wn-note__head row items-center no-wrap">
            <span
              class="wn-ava"
              :style="{ background: authorColor(n.author) }"
              aria-hidden="true"
              >{{ authorInitial(n.author) }}</span
            >
            <span class="wn-note__author" data-testid="note-author">{{
              displayName(n)
            }}</span>
            <span class="wn-note__time" data-testid="note-time">{{
              formatTime(n.created_at)
            }}</span>
            <span class="wn-note__actions row items-center no-wrap">
              <span
                v-if="n.visibility === 'private'"
                class="wn-note__private"
                aria-label="Private"
                title="Private"
                data-testid="note-private"
              >
                <q-icon name="lock" size="13px" />
              </span>
              <!-- Only the author can flip visibility (server enforces it too). -->
              <button
                v-if="n.author === activeUser"
                class="wn-note__flip"
                data-testid="note-flip"
                @click="
                  emit(
                    'flip',
                    n.id,
                    n.visibility === 'private' ? 'shared' : 'private',
                  )
                "
              >
                {{
                  n.visibility === "private" ? "Make shared" : "Make private"
                }}
              </button>
            </span>
          </div>
          <div class="wn-note__text">{{ n.text }}</div>
        </div>
      </div>

      <!-- Add a note. -->
      <div class="wn-add column q-mt-md">
        <div class="wn-add__label">Add a note</div>
        <textarea
          v-model="text"
          class="wn-input wn-input--area"
          :class="{ 'wn-input--error': overLimit }"
          rows="2"
          placeholder="Add a note…"
          aria-describedby="wn-note-error"
          data-testid="note-text-input"
          @keydown.enter.meta.prevent="onAdd"
          @keydown.enter.ctrl.prevent="onAdd"
        />
        <div class="wn-count row items-center justify-between q-mt-xs">
          <span
            id="wn-note-error"
            class="wn-count__error"
            role="alert"
            aria-live="polite"
          >
            <span v-if="overLimit" data-testid="note-error">
              Note must be {{ MAX_NOTE_LENGTH }} characters or fewer.
            </span>
          </span>
          <span
            v-if="showCount"
            class="wn-count__num"
            :class="overLimit ? 'wn-count__num--error' : 'wn-count__num--near'"
            data-testid="note-count"
          >
            {{ trimmedLength }}/{{ MAX_NOTE_LENGTH }}
          </span>
        </div>
        <div class="wn-add__row row items-center justify-between q-mt-sm">
          <div class="wn-vis row no-wrap">
            <button
              class="wn-vis__btn"
              :class="{ 'wn-vis__btn--shared-on': visibility === 'shared' }"
              data-testid="note-vis-shared"
              @click="visibility = 'shared'"
            >
              Shared
            </button>
            <button
              class="wn-vis__btn"
              :class="{ 'wn-vis__btn--private-on': visibility === 'private' }"
              data-testid="note-vis-private"
              @click="visibility = 'private'"
            >
              <q-icon name="lock" size="13px" /> Private
            </button>
          </div>
          <q-btn
            label="Add"
            no-caps
            unelevated
            :disable="!text.trim() || overLimit"
            data-testid="note-add"
            @click="onAdd"
          />
        </div>
      </div>

      <div class="row justify-end q-mt-md">
        <q-btn
          flat
          no-caps
          label="Done"
          data-testid="notes-done"
          @click="emit('update:modelValue', false)"
        />
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type { HotaruUser, Note, Visibility, Word } from "@/apps/hotaru/types";

const props = defineProps<{
  word: Word;
  notes: Note[];
  users: HotaruUser[];
  modelValue: boolean;
  // The viewing user — their own notes read as "You". Optional so the dialog
  // still renders (with plain names) if it isn't supplied.
  activeUser?: string;
}>();

// Per-user identity hue, reused from the avatar system (DESIGN.md: Dani=violet,
// Jake=amber). Distinct from the lock, which signals privacy, not identity.
const AUTHOR_COLORS: Record<string, string> = {
  dani: "#9b6bff",
  jake: "#ffce5c",
};

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  add: [text: string, visibility: Visibility];
  flip: [noteId: string, visibility: Visibility];
}>();

// Keep in sync with notes_service.MAX_NOTE_LENGTH (backend enforces the same).
const MAX_NOTE_LENGTH = 300;

const text = ref("");
const visibility = ref<Visibility>("shared");

// Count the trimmed length everywhere — it's what the backend validates, so the
// readout, the warn threshold, and the over-limit gate all agree (trailing
// whitespace never makes the counter and the gate disagree).
const trimmedLength = computed(() => text.value.trim().length);
const overLimit = computed(() => trimmedLength.value > MAX_NOTE_LENGTH);

// Stay quiet until the last stretch — a running tally from keystroke one reads
// as pressure; the count only matters as you approach the cap.
const COUNT_WARN_AT = MAX_NOTE_LENGTH - 40;
const showCount = computed(() => trimmedLength.value >= COUNT_WARN_AT);

// Newest first for reading (the API returns oldest→newest).
const ordered = computed(() => [...props.notes].reverse());

function authorName(id: string): string {
  return props.users.find((u) => u.id === id)?.name ?? id;
}

// The active user sees their own notes attributed to "You"; the initial + hue
// still come from the real author so the identity colour stays consistent.
function displayName(n: Note): string {
  return n.author === props.activeUser ? "You" : authorName(n.author);
}

function authorInitial(id: string): string {
  return ((authorName(id) ?? "")[0] ?? "?").toUpperCase();
}

function authorColor(id: string): string {
  return AUTHOR_COLORS[id] ?? "#7c78b8";
}

// A whisper-quiet relative time — informational, never a countdown/debt.
function formatTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, (Date.now() - then) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 7 * 86400) return `${Math.floor(secs / 86400)}d ago`;
  return new Date(then).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function resetDraft(): void {
  text.value = "";
  visibility.value = "shared";
}

// The dialog stays mounted across words (LibraryPage swaps the `word` prop and
// reopens), so clear any unsent draft when it opens or the word changes —
// otherwise text/visibility from one word leaks into the next.
watch(
  () => props.modelValue,
  (open) => {
    if (open) resetDraft();
  },
);
watch(() => props.word.id, resetDraft);

function onAdd(): void {
  const value = text.value.trim();
  if (!value || overLimit.value) return;
  emit("add", value, visibility.value);
  resetDraft();
}
</script>

<style scoped lang="sass">
// q-dialog teleports to <body> (outside `.hotaru-app`), so the --hotaru-* vars
// don't resolve — hardcode the Neon Yūgure dusk palette.
// Column layout so the header + composer stay put and only the note list
// scrolls — a word with many notes can't push the Add box off-screen.
.wn-dialog
  display: flex
  flex-direction: column
  background: rgba(20, 18, 52, 0.98)
  backdrop-filter: blur(16px)
  color: #f1f0ff
  border: 1px solid rgba(155, 107, 255, 0.30)
  border-radius: 14px
  padding: 18px
  min-width: 300px
  max-width: 92vw
  max-height: 88vh

// A distinct title block (small uppercase eyebrow + the headword) with a rule
// under it, so it reads as the window title and not the first note.
.wn-header
  flex: none
  display: flex
  align-items: baseline
  gap: 8px
  padding-bottom: 10px
  margin-bottom: 4px
  border-bottom: 1px solid rgba(155, 107, 255, 0.22)

.wn-header__eyebrow
  font-size: 11px
  font-weight: 600
  letter-spacing: 0.14em
  text-transform: uppercase
  color: #8f88c9

.wn-header__word
  font-size: 18px
  font-weight: 600
  color: #f1f0ff

.wn-empty
  color: #b3aede
  font-size: 13px
  padding: 8px 0

// The scroll region: flexes to fill, capped by the dialog's max-height.
.wn-list
  flex: 1 1 auto
  min-height: 0
  overflow-y: auto
  margin: 0 -4px
  padding: 0 4px

.wn-list::-webkit-scrollbar
  width: 8px

.wn-list::-webkit-scrollbar-thumb
  background: rgba(155, 107, 255, 0.40)
  border-radius: 4px

.wn-note
  padding: 8px 0
  border-bottom: 1px solid rgba(155, 107, 255, 0.16)

.wn-note__head
  gap: 7px
  margin-bottom: 4px

// Coloured initial chip — identity, reusing the avatar hue per user.
.wn-ava
  flex: none
  width: 20px
  height: 20px
  border-radius: 9999px
  display: inline-flex
  align-items: center
  justify-content: center
  font-size: 11px
  font-weight: 700
  color: #0b0620

.wn-note__author
  font-size: 13px
  font-weight: 600
  color: #f1f0ff

.wn-note__time
  font-size: 11px
  color: #8f88c9

// Right-aligned cluster: privacy mark + (for own notes) the flip control.
.wn-note__actions
  margin-left: auto
  gap: 8px

// Amber lock — privacy, not identity.
.wn-note__private
  display: inline-flex
  align-items: center
  color: #ffce5c

// Quiet text button — the author's visibility flip; violet, underlined on hover.
.wn-note__flip
  border: none
  background: transparent
  padding: 0
  font-size: 11px
  color: #b19bff
  cursor: pointer

.wn-note__flip:hover
  text-decoration: underline

.wn-note__text
  font-size: 14px
  color: #f1f0ff
  white-space: pre-wrap
  overflow-wrap: anywhere

.wn-add
  flex: none
  margin-top: 14px

.wn-add__label
  font-size: 11px
  font-weight: 600
  letter-spacing: 0.14em
  text-transform: uppercase
  color: #8f88c9
  margin-bottom: 6px

.wn-input
  background: rgba(4, 6, 15, 0.5)
  border: 1px solid rgba(155, 107, 255, 0.30)
  border-radius: 10px
  padding: 10px
  color: #f1f0ff
  font-size: 14px
  outline: none

.wn-input:focus
  border-color: #38f0e6
  box-shadow: 0 0 0 1px rgba(56, 240, 230, 0.4)

// A note is a thought, not a label — give it room (2 rows, grows to a cap).
.wn-input--area
  width: 100%
  resize: vertical
  min-height: 46px
  max-height: 140px
  font-family: inherit
  line-height: 1.4

.wn-input--error, .wn-input--error:focus
  border-color: #ff6b8a
  box-shadow: 0 0 0 1px rgba(255, 107, 138, 0.4)

.wn-count
  min-height: 16px

.wn-count__num
  font-size: 11px
  color: #b3aede

// Amber as you near the cap, red once over — a gentle ramp, not an alarm.
.wn-count__num--near
  color: #ffce5c

.wn-count__num--error
  color: #ff6b8a

.wn-count__error
  font-size: 12px
  color: #ff6b8a

.wn-vis
  border: 1px solid rgba(155, 107, 255, 0.30)
  border-radius: 9999px
  overflow: hidden

.wn-vis__btn
  border: none
  background: transparent
  color: #b3aede
  padding: 5px 12px
  font-size: 13px
  cursor: pointer

// Selected states carry the palette's meaning: shared = violet (the implicit,
// tertiary accent), private = amber (with the lock) — never the cyan CTA hue.
.wn-vis__btn--shared-on
  background: #9b6bff
  color: #0b0620

.wn-vis__btn--private-on
  background: #ffce5c
  color: #2a1e00
</style>
