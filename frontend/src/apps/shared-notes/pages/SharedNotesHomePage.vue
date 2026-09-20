<template>
  <q-page class="shared-notes-home q-pa-md">
    <div class="row items-center justify-between q-mb-lg">
      <div class="text-h5">Shared Notes</div>
      <q-btn
        unelevated
        no-caps
        color="primary"
        icon="add"
        label="New note"
        data-testid="new-note"
        @click="openCreate"
      />
    </div>

    <div v-if="store.error" class="text-negative q-mb-md" data-testid="error">
      {{ store.error }}
    </div>

    <!-- Only claim the list is empty when we actually know it is: a failed
         load has no notes either, and saying "none yet" there is a lie. -->
    <div
      v-if="!store.loading && !store.error && store.notes.length === 0"
      class="text-grey-6"
      data-testid="empty-state"
    >
      No notes yet — start one and it is yours until you share it.
    </div>

    <q-list v-else separator>
      <q-item
        v-for="note in store.notes"
        :key="note.id"
        clickable
        :data-testid="`note-${note.id}`"
        @click="open(note.id)"
      >
        <q-item-section>
          <q-item-label>{{ note.title }}</q-item-label>
          <q-item-label caption>
            {{ byline(note) }} · edited {{ relativeTime(note.updated_at) }}
          </q-item-label>
        </q-item-section>

        <q-item-section side>
          <div class="row items-center q-gutter-xs">
            <template v-if="confirmingId === note.id">
              <span class="text-caption q-mr-xs">Delete this note?</span>
              <q-btn
                dense
                flat
                no-caps
                color="negative"
                label="Delete"
                :data-testid="`delete-confirm-${note.id}`"
                @click.stop="confirmDelete(note.id)"
              />
              <q-btn
                dense
                flat
                no-caps
                label="Keep"
                :data-testid="`delete-cancel-${note.id}`"
                @click.stop="confirmingId = null"
              />
            </template>

            <!-- Only the owner deletes. The backend enforces this with a 403;
                 hiding the control is convenience, not the boundary. -->
            <q-btn
              v-else-if="isMine(note)"
              dense
              flat
              round
              icon="delete"
              :data-testid="`delete-${note.id}`"
              @click.stop="confirmingId = note.id"
            />
          </div>
        </q-item-section>
      </q-item>
    </q-list>

    <q-dialog v-model="dialogOpen">
      <q-card style="min-width: 320px">
        <q-card-section class="text-subtitle1">New note</q-card-section>
        <q-card-section>
          <q-input
            v-model="titleDraft"
            dense
            outlined
            autofocus
            label="Title"
            data-testid="new-note-title"
            @keyup.enter="create"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            flat
            no-caps
            label="Cancel"
            data-testid="new-note-cancel"
            @click="dialogOpen = false"
          />
          <q-btn
            unelevated
            no-caps
            color="primary"
            label="Create"
            :disable="!titleDraft.trim()"
            data-testid="new-note-submit"
            @click="create"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useSharedNotesStore } from "@/apps/shared-notes/stores/useSharedNotesStore";
import { relativeTime } from "@/apps/shared-notes/time";
import { useAuthStore } from "@/stores/useAuthStore";
import type { NoteSummary } from "@/apps/shared-notes/types";

const store = useSharedNotesStore();
const auth = useAuthStore();
const router = useRouter();

const dialogOpen = ref(false);
const titleDraft = ref("");
const confirmingId = ref<string | null>(null);

const me = computed(() => auth.username);

function isMine(note: NoteSummary): boolean {
  return note.owner === me.value;
}

// Until Epic 2 adds the shared-with-me / shared-by-me badges (Story 2.3), the
// owner's name is the whole signal for whose note this is.
function byline(note: NoteSummary): string {
  return isMine(note) ? "Mine" : `Shared by ${note.owner}`;
}

onMounted(() => {
  void store.fetchNotes();
});

function open(noteId: string): void {
  // A row click opens the note, but not while that row is mid-confirmation.
  if (confirmingId.value === noteId) return;
  void router.push(`/shared-notes/notes/${noteId}`);
}

function openCreate(): void {
  titleDraft.value = "";
  dialogOpen.value = true;
}

async function create(): Promise<void> {
  const title = titleDraft.value.trim();
  if (!title) return;
  try {
    const note = await store.createNote(title);
    dialogOpen.value = false;
    void router.push(`/shared-notes/notes/${note.id}`);
  } catch {
    // createNote already routed the message into store.error; stay put.
    dialogOpen.value = false;
  }
}

async function confirmDelete(noteId: string): Promise<void> {
  await store.deleteNote(noteId);
  confirmingId.value = null;
}
</script>
