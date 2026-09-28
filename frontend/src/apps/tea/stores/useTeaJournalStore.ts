import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import { downscaleImage } from "@/apps/tea/image";
import type { JournalEdit, JournalEntry, TeaSession, TeaSessionWrite } from "@/apps/tea/types";

function message(e: unknown): string {
  if (e && typeof e === "object" && "detail" in e) {
    const detail = (e as { detail: unknown }).detail;
    if (typeof detail === "string" && detail.length > 0) return detail;
  }
  return e instanceof Error ? e.message : String(e);
}

/** Every finished sitting in the cabinet, newest first, as the Journal shows them. */
export const useTeaJournalStore = defineStore("tea-journal", () => {
  const entries = ref<JournalEntry[]>([]);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  function byId(id: string): JournalEntry | null {
    return entries.value.find((e) => e.id === id) ?? null;
  }

  function patch(id: string, fields: Partial<JournalEntry>): void {
    entries.value = entries.value.map((e) => (e.id === id ? { ...e, ...fields } : e));
  }

  async function fetchJournal(): Promise<void> {
    loading.value = true;
    try {
      entries.value = await api.get<JournalEntry[]>("/tea/journal");
      error.value = null;
    } catch (e) {
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  async function write(action: () => Promise<void>): Promise<boolean> {
    saving.value = true;
    try {
      await action();
      error.value = null;
      return true;
    } catch (e) {
      error.value = message(e);
      return false;
    } finally {
      saving.value = false;
    }
  }

  function create(id: string, body: TeaSessionWrite): Promise<boolean> {
    return write(async () => {
      await api.put<TeaSession>(`/tea/sessions/${id}`, { ...body });
      // The server resolves the tea's name and class; reload rather than guess them.
      await fetchJournal();
    });
  }

  function edit(id: string, body: JournalEdit): Promise<boolean> {
    return write(async () => {
      const saved = await api.put<JournalEntry>(`/tea/sessions/${id}/journal`, { ...body });
      entries.value = entries.value.map((e) => (e.id === id ? saved : e));
    });
  }

  function remove(id: string): Promise<boolean> {
    return write(async () => {
      await api.del(`/tea/sessions/${id}/journal`);
      entries.value = entries.value.filter((e) => e.id !== id);
    });
  }

  function uploadPhoto(id: string, file: File): Promise<boolean> {
    return write(async () => {
      const saved = await api.upload<TeaSession>(
        `/tea/sessions/${id}/image`,
        await downscaleImage(file),
      );
      patch(id, { image_url: saved.image_url });
    });
  }

  function removePhoto(id: string): Promise<boolean> {
    return write(async () => {
      await api.del<TeaSession>(`/tea/sessions/${id}/image`);
      patch(id, { image_url: null });
    });
  }

  return {
    entries,
    loading,
    saving,
    error,
    byId,
    fetchJournal,
    create,
    edit,
    remove,
    uploadPhoto,
    removePhoto,
  };
});
