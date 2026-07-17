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
              <!-- The author can flip visibility, edit the text, or delete
                   (the server enforces author-only too). -->
              <template v-if="n.author === activeUser && editingId !== n.id">
                <button
                  class="wn-note__act"
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
                <button
                  class="wn-note__act"
                  data-testid="note-edit"
                  @click="startEdit(n)"
                >
                  Edit
                </button>
                <button
                  class="wn-note__act wn-note__act--danger"
                  data-testid="note-delete"
                  @click="onDelete(n)"
                >
                  Delete
                </button>
              </template>
            </span>
          </div>
          <div v-if="editingId === n.id" class="wn-note__edit">
            <NoteComposer
              :text="editText"
              :visibility="n.visibility"
              :show-visibility="false"
              submit-label="Save"
              placeholder="Edit note…"
              input-testid="note-edit-input"
              submit-testid="note-edit-save"
              @update:text="editText = $event"
              @add="(t) => onEditSave(n.id, t)"
            />
            <button
              class="wn-note__act"
              data-testid="note-edit-cancel"
              @click="editingId = null"
            >
              Cancel
            </button>
          </div>
          <div v-else class="wn-note__text">{{ n.text }}</div>
        </div>
      </div>

      <!-- Add a note. -->
      <div class="wn-add column q-mt-md">
        <div class="wn-add__label">Add a note</div>
        <NoteComposer
          v-model:text="text"
          v-model:visibility="visibility"
          @add="onAdd"
        />
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
import { useNoteDisplay } from "@/apps/hotaru/composables/useNoteDisplay";
import NoteComposer from "@/apps/hotaru/components/NoteComposer.vue";

const props = defineProps<{
  word: Word;
  notes: Note[];
  users: HotaruUser[];
  modelValue: boolean;
  // The viewing user — their own notes read as "You". Optional so the dialog
  // still renders (with plain names) if it isn't supplied.
  activeUser?: string;
}>();

const { displayName, authorInitial, authorColor, formatTime } = useNoteDisplay(
  () => props.users,
  () => props.activeUser,
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  add: [text: string, visibility: Visibility];
  flip: [noteId: string, visibility: Visibility];
  edit: [noteId: string, text: string];
  delete: [noteId: string];
}>();

const text = ref("");
const visibility = ref<Visibility>("shared");

// Newest first for reading (the API returns oldest→newest).
const ordered = computed(() => [...props.notes].reverse());

function resetDraft(): void {
  text.value = "";
  visibility.value = "shared";
  // Also drop any in-progress inline edit, so a note isn't left stuck in edit
  // mode (with its controls hidden) when the dialog reopens or the word changes.
  editingId.value = null;
  editText.value = "";
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

// NoteComposer validates (non-empty, ≤300); it only emits when valid.
function onAdd(value: string, vis: Visibility): void {
  emit("add", value, vis);
  resetDraft();
}

// Edit / delete a note the active user authored (Story 3.6).
const editingId = ref<string | null>(null);
const editText = ref("");

function startEdit(n: Note): void {
  editingId.value = n.id;
  editText.value = n.text;
}

function onEditSave(noteId: string, text: string): void {
  emit("edit", noteId, text);
  editingId.value = null;
}

function onDelete(n: Note): void {
  if (window.confirm("Delete this note?")) emit("delete", n.id);
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

// Quiet text buttons — the author's flip / edit / delete actions.
.wn-note__act
  border: none
  background: transparent
  padding: 0
  font-size: 11px
  color: #b19bff
  cursor: pointer

.wn-note__act:hover
  text-decoration: underline

.wn-note__act--danger
  color: #ff6b8a

.wn-note__edit
  display: flex
  flex-direction: column
  gap: 4px
  margin-top: 4px

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
</style>
