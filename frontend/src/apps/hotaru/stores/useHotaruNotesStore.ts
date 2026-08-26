import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { Note, Visibility } from "@/apps/hotaru/types";

export const useHotaruNotesStore = defineStore("hotaruNotes", () => {
  // Notes keyed by word id (the active user's privacy-filtered view).
  const notesByWord = ref<Record<string, Note[]>>({});
  // Word ids that have a note visible to the active user — the library's
  // "has a note" indicator (loaded up front; per-word notes load on demand).
  const presence = ref<Set<string>>(new Set());
  const loading = ref(false);
  const error = ref<string | null>(null);

  function notesFor(wordId: string): Note[] {
    return notesByWord.value[wordId] ?? [];
  }

  function hasNote(wordId: string): boolean {
    return presence.value.has(wordId);
  }

  async function loadPresence(user: string): Promise<void> {
    try {
      const ids = await api.get<string[]>(
        `/hotaru/notes/presence?user=${encodeURIComponent(user)}`,
      );
      presence.value = new Set(ids);
    } catch (e) {
      // Non-fatal — the indicator is decorative; surface but don't block.
      error.value =
        (e as { detail?: string }).detail ??
        (e instanceof Error ? e.message : String(e));
    }
  }

  async function loadNotes(wordId: string, user: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      notesByWord.value = {
        ...notesByWord.value,
        [wordId]: await api.get<Note[]>(
          `/hotaru/words/${encodeURIComponent(wordId)}/notes?user=${encodeURIComponent(user)}`,
        ),
      };
    } catch (e) {
      error.value =
        (e as { detail?: string }).detail ??
        (e instanceof Error ? e.message : String(e));
    } finally {
      loading.value = false;
    }
  }

  async function addNote(
    wordId: string,
    payload: { text: string; visibility: Visibility },
    user: string,
  ): Promise<Note | null> {
    loading.value = true;
    error.value = null;
    try {
      const created = await api.post<Note>(
        `/hotaru/words/${encodeURIComponent(wordId)}/notes?user=${encodeURIComponent(user)}`,
        payload as unknown as Record<string, unknown>,
      );
      // Reflect locally (append) — the note is already persisted.
      notesByWord.value = {
        ...notesByWord.value,
        [wordId]: [...notesFor(wordId), created],
      };
      // The word now has a note → light its library indicator.
      if (!presence.value.has(wordId)) {
        presence.value = new Set(presence.value).add(wordId);
      }
      return created;
    } catch (e) {
      error.value =
        (e as { detail?: string }).detail ??
        (e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function setVisibility(
    wordId: string,
    noteId: string,
    visibility: Visibility,
    user: string,
  ): Promise<Note | null> {
    loading.value = true;
    error.value = null;
    try {
      const updated = await api.patch<Note>(
        `/hotaru/notes/${encodeURIComponent(noteId)}?user=${encodeURIComponent(user)}`,
        { visibility },
      );
      // Replace the note in place, preserving order.
      notesByWord.value = {
        ...notesByWord.value,
        [wordId]: notesFor(wordId).map((n) => (n.id === noteId ? updated : n)),
      };
      return updated;
    } catch (e) {
      error.value =
        (e as { detail?: string }).detail ??
        (e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function editNote(
    wordId: string,
    noteId: string,
    text: string,
    user: string,
  ): Promise<Note | null> {
    loading.value = true;
    error.value = null;
    try {
      const updated = await api.patch<Note>(
        `/hotaru/notes/${encodeURIComponent(noteId)}?user=${encodeURIComponent(user)}`,
        { text },
      );
      // Only reflect into a word that's actually loaded — otherwise we'd write a
      // bogus [] for a word whose notes live elsewhere (e.g. the drill queue).
      if (wordId in notesByWord.value) {
        notesByWord.value = {
          ...notesByWord.value,
          [wordId]: notesFor(wordId).map((n) =>
            n.id === noteId ? updated : n,
          ),
        };
      }
      return updated;
    } catch (e) {
      error.value =
        (e as { detail?: string }).detail ??
        (e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function deleteNote(
    wordId: string,
    noteId: string,
    user: string,
  ): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      await api.del(
        `/hotaru/notes/${encodeURIComponent(noteId)}?user=${encodeURIComponent(user)}`,
      );
      if (wordId in notesByWord.value) {
        notesByWord.value = {
          ...notesByWord.value,
          [wordId]: notesFor(wordId).filter((n) => n.id !== noteId),
        };
      }
      return true;
    } catch (e) {
      error.value =
        (e as { detail?: string }).detail ??
        (e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      loading.value = false;
    }
  }

  return {
    notesByWord,
    presence,
    loading,
    error,
    notesFor,
    hasNote,
    loadPresence,
    loadNotes,
    addNote,
    setVisibility,
    editNote,
    deleteNote,
  };
});
