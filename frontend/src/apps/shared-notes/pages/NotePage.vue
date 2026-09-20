<template>
  <q-page class="shared-notes-note column q-pa-md">
    <div
      v-if="store.notFound"
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
        @input="autosave.schedule()"
      ></textarea>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
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

const autosave = useAutosave(saveBody);

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
});

// Leaving the page must not drop what was typed in the debounce window.
onBeforeUnmount(() => autosave.flush());

async function saveBody(): Promise<void> {
  if (await store.saveNote(noteId.value, { body: bodyDraft.value })) {
    savedOnce.value = true;
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
