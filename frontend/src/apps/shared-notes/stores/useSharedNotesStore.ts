import { ref } from "vue";
import { defineStore } from "pinia";
import { api, ApiError } from "@/composables/useApi";
import { useAuthStore } from "@/stores/useAuthStore";
import {
  useNoteEvents,
  type ClosedReason,
  type NoteEventsSubscription,
} from "@/apps/shared-notes/composables/useNoteEvents";
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

  // ── live channel for the open note (Story 2.2) ──────────────────────────
  // Set when the note stops being mine to see — the editor watches it and
  // leaves with a reason rather than failing on the next save.
  const closedReason = ref<ClosedReason | null>(null);
  // The last remote revision applied, so the editor can decide what to do with
  // text the user has typed since their last save. Replaced, never queued: only
  // the newest matters, because reconciliation is a full refetch.
  const remoteChange = ref<{ rev: number; actor: string } | null>(null);

  let subscription: NoteEventsSubscription | null = null;

  function me(): string | null {
    return useAuthStore().username;
  }

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
    closedReason.value = null;
    remoteChange.value = null;
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

  /** Refetch the open note without flipping `loading` — a live refetch must
   *  not blank the editor someone is typing in. */
  async function refetchQuietly(noteId: string): Promise<void> {
    try {
      currentNote.value = await api.get<Note>(`/shared-notes/notes/${noteId}`);
    } catch (e) {
      // A refetch that races a delete/unshare is handled by `note.closed`;
      // anything else is worth reporting.
      if (!(e instanceof ApiError && e.status === 404)) {
        error.value = message(e);
      }
    }
  }

  function subscribeToNote(noteId: string): void {
    unsubscribeFromNote();
    const token = useAuthStore().token;
    if (!token) return;

    subscription = useNoteEvents(noteId, token, {
      onChanged: (event) => {
        // My own write echoes back to me, and a rev I already hold tells me
        // nothing new — neither is worth a refetch.
        if (event.actor === me()) return;
        if (currentNote.value && event.rev <= currentNote.value.rev) return;
        void refetchQuietly(noteId).then(() => {
          remoteChange.value = { rev: event.rev, actor: event.actor };
        });
      },
      onMembersChanged: (event) => {
        if (currentNote.value) currentNote.value.members = event.members;
      },
      onClosed: (event) => {
        // A "removed" frame reaches every subscriber; only the named member
        // has actually lost access.
        if (event.reason === "removed" && event.member !== me()) return;
        closedReason.value = event.reason;
        notes.value = notes.value.filter((n) => n.id !== noteId);
      },
    });
  }

  function unsubscribeFromNote(): void {
    subscription?.close();
    subscription = null;
  }

  return {
    notes,
    currentNote,
    closedReason,
    remoteChange,
    subscribeToNote,
    unsubscribeFromNote,
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
