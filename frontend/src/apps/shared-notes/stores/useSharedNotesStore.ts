import { ref } from "vue";
import { defineStore } from "pinia";
import { api, ApiError } from "@/composables/useApi";
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
  const currentNote = ref<Note | null>(null);
  const loading = ref(false);
  // Saving is tracked apart from `loading` on purpose: an autosave must never
  // put the open editor into a loading state while someone is typing in it.
  const saving = ref(false);
  const notFound = ref(false);
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

  async function openNote(noteId: string): Promise<void> {
    loading.value = true;
    error.value = null;
    notFound.value = false;
    try {
      currentNote.value = await api.get<Note>(`/shared-notes/notes/${noteId}`);
    } catch (e) {
      // A 404 is not a fault to report — it is the note not being mine, which
      // the page renders as its own state. Anything else is a real error.
      if (e instanceof ApiError && e.status === 404) {
        currentNote.value = null;
        notFound.value = true;
      } else {
        error.value = message(e);
      }
    } finally {
      loading.value = false;
    }
  }

  /**
   * Write the supplied fields. Returns whether the save landed, so the caller
   * can revert a rejected field without having to read `error`.
   *
   * The response updates `currentNote` — the server copy — but callers must
   * keep their own draft of whatever is being typed: the local text is ahead
   * of any response by the time it arrives. Story 2.2 hooks another member's
   * changes in here.
   */
  async function saveNote(
    noteId: string,
    fields: { title?: string; body?: string },
  ): Promise<boolean> {
    saving.value = true;
    error.value = null;
    try {
      const saved = await api.put<Note>(
        `/shared-notes/notes/${noteId}`,
        fields,
      );
      currentNote.value = saved;
      const summary = notes.value.find((n) => n.id === noteId);
      if (summary) {
        summary.title = saved.title;
        summary.updated_at = saved.updated_at;
      }
      return true;
    } catch (e) {
      error.value = message(e);
      return false;
    } finally {
      saving.value = false;
    }
  }

  return {
    notes,
    currentNote,
    loading,
    saving,
    notFound,
    error,
    fetchNotes,
    createNote,
    deleteNote,
    openNote,
    saveNote,
  };
});
