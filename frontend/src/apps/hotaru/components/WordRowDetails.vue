<template>
  <div class="wrd" data-testid="row-details">
    <!-- Topics this word belongs to (display); the button opens the topics
         dialog to assign/unassign/create. -->
    <section class="wrd-section">
      <div class="wrd-head row items-center justify-between">
        <span class="wrd-label">Topics</span>
        <button
          class="wrd-manage"
          data-testid="row-manage-topics"
          @click="emit('manage-topics', word)"
        >
          ＋ Topic
        </button>
      </div>
      <div v-if="assignedTopics.length" class="wrd-topics row">
        <span
          v-for="t in assignedTopics"
          :key="t.id"
          class="wrd-chip"
          :data-testid="`row-topic-${t.id}`"
          >{{ t.name }}</span
        >
      </div>
      <div v-else class="wrd-hint">Not in any topic yet.</div>
    </section>

    <!-- Notes on this word (display, privacy-filtered); the button opens the
         notes dialog to add / change visibility. -->
    <section class="wrd-section">
      <div class="wrd-head row items-center justify-between">
        <span class="wrd-label">Notes</span>
        <button
          class="wrd-manage"
          data-testid="row-add-note"
          @click="emit('manage-notes', word)"
        >
          ＋ Note
        </button>
      </div>
      <div v-if="ordered.length === 0" class="wrd-hint">No notes yet.</div>
      <div
        v-for="n in ordered"
        :key="n.id"
        class="wrd-note"
        data-testid="row-note-item"
      >
        <div class="wrd-note__head row items-center no-wrap">
          <span
            class="wrd-ava"
            :style="{ background: authorColor(n.author) }"
            aria-hidden="true"
            >{{ authorInitial(n.author) }}</span
          >
          <span class="wrd-note__author">{{ displayName(n) }}</span>
          <span class="wrd-note__time">{{ formatTime(n.created_at) }}</span>
          <span
            v-if="n.visibility === 'private'"
            class="wrd-note__lock"
            aria-label="Private"
            title="Private"
            data-testid="row-note-private"
          >
            <q-icon name="lock" size="12px" />
          </span>
        </div>
        <div class="wrd-note__text">{{ n.text }}</div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { HotaruUser, Note, Topic, Word } from "@/apps/hotaru/types";
import { useNoteDisplay } from "@/apps/hotaru/composables/useNoteDisplay";

// Inline expanded-row panel (Story 3.5): a read view of a word's assigned
// topics + its notes, with buttons that open the existing topics/notes dialogs
// for all editing. In-app (inside `.hotaru-app`), so it uses `var(--hotaru-*)`.
const props = defineProps<{
  word: Word;
  topics: Topic[];
  notes: Note[];
  users: HotaruUser[];
  activeUser?: string;
}>();

const emit = defineEmits<{
  "manage-topics": [word: Word];
  "manage-notes": [word: Word];
}>();

const { displayName, authorInitial, authorColor, formatTime } = useNoteDisplay(
  () => props.users,
  () => props.activeUser,
);

const assignedTopics = computed(() =>
  props.topics.filter((t) => t.word_ids.includes(props.word.id)),
);

// Newest first (the API returns oldest→newest).
const ordered = computed(() => [...props.notes].reverse());
</script>

<style scoped lang="sass">
.wrd
  padding: 4px 6px 12px
  border-bottom: 1px solid rgba(155, 107, 255, 0.16)
  background: rgba(155, 107, 255, 0.04)

.wrd-section
  padding: 8px 2px

.wrd-head
  margin-bottom: 6px

.wrd-label
  font-size: 11px
  font-weight: 600
  letter-spacing: 0.14em
  text-transform: uppercase
  color: var(--hotaru-sage)

// Small pill button that opens the relevant dialog.
.wrd-manage
  border: 1px solid rgba(56, 240, 230, 0.4)
  background: rgba(56, 240, 230, 0.08)
  color: var(--hotaru-cream-soft)
  border-radius: 9999px
  padding: 3px 12px
  font-size: 12px
  cursor: pointer

.wrd-hint
  font-size: 13px
  color: var(--hotaru-sage)

.wrd-topics
  gap: 6px
  flex-wrap: wrap

// Assigned-topic pills (display only — editing is in the dialog).
.wrd-chip
  background: var(--hotaru-fam-2)
  color: #0b0620
  border-radius: 9999px
  padding: 3px 12px
  font-size: 12px

.wrd-note
  padding: 6px 0
  border-bottom: 1px solid rgba(155, 107, 255, 0.12)

.wrd-note__head
  gap: 7px
  margin-bottom: 3px

.wrd-ava
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

.wrd-note__author
  font-size: 13px
  font-weight: 600
  color: var(--hotaru-cream)

.wrd-note__time
  font-size: 11px
  color: var(--hotaru-sage)

.wrd-note__lock
  margin-left: auto
  display: inline-flex
  align-items: center
  color: var(--hotaru-amber-private)

.wrd-note__text
  font-size: 14px
  color: var(--hotaru-cream)
  white-space: pre-wrap
  overflow-wrap: anywhere
</style>
