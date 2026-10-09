import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { Teaware, TeawareUsage, TeawareWrite } from "@/apps/tea/types";

function message(e: unknown): string {
  if (e && typeof e === "object" && "detail" in e) {
    const detail = (e as { detail: unknown }).detail;
    if (typeof detail === "string" && detail.length > 0) return detail;
  }
  return e instanceof Error ? e.message : String(e);
}

export const useTeawareStore = defineStore("tea-teaware", () => {
  const items = ref<Teaware[]>([]);
  const loading = ref(false);
  // Apart from `loading`, so a write never blanks the shelf being looked at.
  const saving = ref(false);
  const error = ref<string | null>(null);

  function put(item: Teaware): void {
    items.value = items.value.some((i) => i.id === item.id)
      ? items.value.map((i) => (i.id === item.id ? item : i))
      : [...items.value, item];
  }

  async function fetchItems(): Promise<void> {
    loading.value = true;
    try {
      items.value = await api.get<Teaware[]>("/tea/teaware");
      error.value = null;
    } catch (e) {
      items.value = [];
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  async function write(run: () => Promise<Teaware>): Promise<Teaware | null> {
    saving.value = true;
    try {
      const item = await run();
      put(item);
      error.value = null;
      return item;
    } catch (e) {
      error.value = message(e);
      return null;
    } finally {
      saving.value = false;
    }
  }

  function createItem(body: TeawareWrite): Promise<Teaware | null> {
    return write(() => api.post<Teaware>("/tea/teaware", { ...body }));
  }

  function replaceItem(id: string, body: TeawareWrite): Promise<Teaware | null> {
    return write(() => api.put<Teaware>(`/tea/teaware/${id}`, { ...body }));
  }

  async function deleteItem(id: string): Promise<boolean> {
    saving.value = true;
    try {
      await api.del(`/tea/teaware/${id}`);
      items.value = items.value.filter((i) => i.id !== id);
      error.value = null;
      return true;
    } catch (e) {
      error.value = message(e);
      return false;
    } finally {
      saving.value = false;
    }
  }

  async function uploadImage(id: string, file: File): Promise<void> {
    await write(() => api.upload<Teaware>(`/tea/teaware/${id}/image`, file));
  }

  async function removeImage(id: string): Promise<void> {
    await write(() => api.del<Teaware>(`/tea/teaware/${id}/image`));
  }

  async function fetchUsage(id: string): Promise<TeawareUsage | null> {
    try {
      const usage = await api.get<TeawareUsage>(`/tea/teaware/${id}/usage`);
      error.value = null;
      return usage;
    } catch (e) {
      error.value = message(e);
      return null;
    }
  }

  /** A best-effort prefill: a failure just means no suggestion, never an error banner. */
  async function lastUsed(teaId: string | null): Promise<Teaware | null> {
    const query = teaId ? `?tea_id=${encodeURIComponent(teaId)}` : "";
    try {
      return await api.get<Teaware | null>(`/tea/teaware/last-used${query}`);
    } catch {
      return null;
    }
  }

  return {
    items,
    loading,
    saving,
    error,
    fetchItems,
    createItem,
    replaceItem,
    deleteItem,
    uploadImage,
    removeImage,
    fetchUsage,
    lastUsed,
  };
});
