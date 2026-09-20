<template>
  <q-page class="shared-notes-note column q-pa-md">
    <div
      v-if="store.closedReason"
      class="column items-start q-gutter-sm"
      data-testid="closed"
    >
      <div class="text-h6">{{ closedHeading }}</div>
      <div class="text-grey-6">{{ closedDetail }}</div>
      <q-btn
        unelevated
        no-caps
        color="primary"
        label="Back to notes"
        data-testid="back-home"
        @click="goHome"
      />
    </div>

    <div
      v-else-if="store.notFound"
      class="column items-start q-gutter-sm"
      data-testid="not-found"
    >
      <div class="text-h6">This note isn't here</div>
      <div class="text-grey-6">
        It may have been deleted, or it was never shared with you.
      </div>
      <q-btn
        unelevated
        no-caps
        color="primary"
        label="Back to notes"
        data-testid="back-home"
        @click="goHome"
      />
    </div>

    <template v-else>
      <div class="row items-center no-wrap q-gutter-sm q-mb-sm">
        <q-btn
          flat
          dense
          round
          icon="arrow_back"
          data-testid="back"
          @click="goHome"
        />
        <q-input
          v-model="titleDraft"
          dense
          borderless
          class="col text-h6"
          data-testid="note-title"
          @blur="commitTitle"
          @keyup.enter="commitTitle"
        />
        <div class="text-caption text-grey-6" data-testid="save-status">
          {{ saveStatus }}
        </div>
        <q-btn
          flat
          dense
          round
          icon="group"
          data-testid="collaborators"
          @click="openCollaborators"
        >
          <q-badge
            v-if="memberCount > 1"
            floating
            color="primary"
            :label="String(memberCount)"
            data-testid="member-count"
          />
        </q-btn>
      </div>

      <div
        v-if="remoteNotice"
        class="text-caption text-grey-6 q-mb-sm"
        data-testid="remote-change"
      >
        {{ remoteNotice }}
      </div>

      <div v-if="store.error" class="text-negative q-mb-sm" data-testid="error">
        {{ store.error }}
      </div>

      <!-- The textarea is the source of truth while typing: it is seeded once
           on load and never written back from a response. -->
      <textarea
        v-model="bodyDraft"
        class="note-body col"
        placeholder="Start writing…"
        data-testid="note-body"
        @input="onBodyInput"
      ></textarea>

      <CollaboratorsDialog
        v-if="collaboratorsOpen"
        v-model="collaboratorsOpen"
      />
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import CollaboratorsDialog from "@/apps/shared-notes/components/CollaboratorsDialog.vue";
import { useAutosave } from "@/apps/shared-notes/composables/useAutosave";
import { useSharedNotesStore } from "@/apps/shared-notes/stores/useSharedNotesStore";

const route = useRoute();
const router = useRouter();
const store = useSharedNotesStore();

const noteId = computed(() => String(route.params.noteId ?? ""));

const titleDraft = ref("");
const bodyDraft = ref("");
// The last title the server accepted — what a rejected edit reverts to.
const savedTitle = ref("");
const savedOnce = ref(false);
// Set while the body holds keystrokes that have not reached the server. It is
// what decides whether an incoming change may touch the textarea.
const dirty = ref(false);
// Names the member whose change arrived while I had unsaved text, so the cue
// explains why the note on screen is not what they just wrote.
const remoteNotice = ref("");
const collaboratorsOpen = ref(false);

const autosave = useAutosave(saveBody);

const memberCount = computed(() => store.currentNote?.members.length ?? 0);

const closedHeading = computed(() =>
  store.closedReason === "deleted" ? "This note was deleted" : "Access removed",
);

const closedDetail = computed(() =>
  store.closedReason === "deleted"
    ? "The owner deleted it while you had it open."
    : "This note is no longer shared with you.",
);

const saveStatus = computed(() => {
  if (store.saving) return "Saving…";
  return savedOnce.value && !store.error ? "Saved" : "";
});

onMounted(async () => {
  await store.openNote(noteId.value);
  const note = store.currentNote;
  if (!note) return;
  titleDraft.value = note.title;
  savedTitle.value = note.title;
  bodyDraft.value = note.body;
  store.subscribeToNote(noteId.value);
});

// Leaving the page must not drop what was typed in the debounce window.
onBeforeUnmount(() => {
  autosave.flush();
  store.unsubscribeFromNote();
});

/**
 * Reconciliation (NFR-5), on another member's change landing:
 *
 * - Nothing unsaved here → adopt the server copy; they are simply ahead.
 * - Unsaved keystrokes here → keep them and say who else wrote. Their text is
 *   already safe on the server; mine exists only in this textarea, so dropping
 *   it is the one unrecoverable option. My next save wins the field, which is
 *   the documented last-write-per-save model.
 *
 * The title is a separate field and reconciles on its own terms: it is adopted
 * unless it is mid-edit here.
 */
watch(
  () => store.remoteChange,
  (change) => {
    const note = store.currentNote;
    if (!change || !note) return;

    if (dirty.value) {
      remoteNotice.value = `${change.actor} edited this note — your unsaved text is kept.`;
    } else {
      bodyDraft.value = note.body;
      remoteNotice.value = "";
    }

    if (titleDraft.value === savedTitle.value) {
      titleDraft.value = note.title;
    }
    savedTitle.value = note.title;
  },
);

// A closed note has nothing left to save into.
watch(
  () => store.closedReason,
  (reason) => {
    if (reason) autosave.cancel();
  },
);

function onBodyInput(): void {
  dirty.value = true;
  autosave.schedule();
}

async function saveBody(): Promise<void> {
  if (store.closedReason) return;
  const sent = bodyDraft.value;
  if (await store.saveNote(noteId.value, { body: sent })) {
    savedOnce.value = true;
    // Only clean if nothing was typed while the save was in flight.
    if (bodyDraft.value === sent) {
      dirty.value = false;
      remoteNotice.value = "";
    }
  }
}

async function commitTitle(): Promise<void> {
  const title = titleDraft.value.trim();
  // Blank is invalid; don't spend a request to be told so.
  if (!title) {
    titleDraft.value = savedTitle.value;
    return;
  }
  if (title === savedTitle.value) return;

  if (await store.saveNote(noteId.value, { title })) {
    savedTitle.value = title;
    titleDraft.value = title;
    savedOnce.value = true;
  } else {
    titleDraft.value = savedTitle.value;
  }
}

function openCollaborators(): void {
  // The store's error belongs to the dialog once it is open; a stale message
  // from an earlier save would read as a sharing failure.
  store.error = null;
  collaboratorsOpen.value = true;
}

function goHome(): void {
  void router.push("/shared-notes");
}
</script>

<style scoped>
.note-body {
  width: 100%;
  min-height: 50vh;
  resize: none;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: 1.6;
}
</style>
