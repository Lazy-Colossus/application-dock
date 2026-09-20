import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { Note, NoteSummary } from "@/apps/shared-notes/types";

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function summarise(note: Note): NoteSummary {
  return {
    id: note.id,
    title: note.title,
    owner: note.owner,
    shared: note.members.length > 1,
    updated_at: note.updated_at,
  };
}

export const useSharedNotesStore = defineStore("shared-notes", () => {
  const notes = ref<NoteSummary[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchNotes(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      notes.value = await api.get<NoteSummary[]>("/shared-notes/notes");
    } catch (e) {
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  async function createNote(title: string): Promise<Note> {
    loading.value = true;
    error.value = null;
    try {
      const created = await api.post<Note>("/shared-notes/notes", { title });
      // The list is newest-edited first and this note was just touched, so it
      // belongs at the top — no refetch needed.
      notes.value.unshift(summarise(created));
      return created;
    } catch (e) {
      // Surface the error AND rethrow so the caller can skip navigating.
      error.value = message(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function deleteNote(noteId: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.del(`/shared-notes/notes/${noteId}`);
      notes.value = notes.value.filter((n) => n.id !== noteId);
    } catch (e) {
      // Leave the note in the list — the server still has it.
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  return { notes, loading, error, fetchNotes, createNote, deleteNote };
});
