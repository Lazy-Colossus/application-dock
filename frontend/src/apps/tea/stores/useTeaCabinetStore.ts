import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { Tea, TeaWrite } from "@/apps/tea/types";

function message(e: unknown): string {
  if (e && typeof e === "object" && "detail" in e) {
    const detail = (e as { detail: unknown }).detail;
    if (typeof detail === "string" && detail.length > 0) return detail;
  }
  return e instanceof Error ? e.message : String(e);
}

/** Strip the server-owned fields off a `Tea` to get a `TeaWrite` body. */
function toWrite(tea: Tea): TeaWrite {
  return {
    name: tea.name,
    catalogue_node_id: tea.catalogue_node_id,
    form: tea.form,
    origin: tea.origin,
    vendor: tea.vendor,
    year: tea.year,
    harvest_season: tea.harvest_season,
    cultivar: tea.cultivar,
    grams_purchased: tea.grams_purchased,
    grams_remaining: tea.grams_remaining,
    price_paid: tea.price_paid,
    purchase_date: tea.purchase_date,
    storage_location: tea.storage_location,
    low_threshold_grams: tea.low_threshold_grams,
    notes: tea.notes,
    image_url: tea.image_url,
  };
}

export const useTeaCabinetStore = defineStore("tea-cabinet", () => {
  const teas = ref<Tea[]>([]);
  const loading = ref(false);
  // Saving is tracked apart from `loading` so an in-place write never blanks
  // the shelf the person is looking at.
  const saving = ref(false);
  const error = ref<string | null>(null);

  async function fetchTeas(): Promise<void> {
    loading.value = true;
    try {
      teas.value = await api.get<Tea[]>("/tea/teas");
      error.value = null;
    } catch (e) {
      // A failed LOAD must not leave a stale shelf under the error banner
      // (EXPERIENCE.md: "the shelf below stays empty rather than showing
      // stale data"). Write failures (setGrams/replaceTea/deleteTea) set the
      // same `error` but intentionally never touch `teas` here — they must
      // leave the shelf exactly as it was.
      teas.value = [];
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  async function createTea(body: TeaWrite): Promise<Tea | null> {
    saving.value = true;
    try {
      const created = await api.post<Tea>("/tea/teas", { ...body });
      teas.value = [...teas.value, created];
      error.value = null;
      return created;
    } catch (e) {
      error.value = message(e);
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function replaceTea(teaId: string, body: TeaWrite): Promise<Tea | null> {
    saving.value = true;
    try {
      const updated = await api.put<Tea>(`/tea/teas/${teaId}`, { ...body });
      teas.value = teas.value.map((tea) => (tea.id === teaId ? updated : tea));
      error.value = null;
      return updated;
    } catch (e) {
      error.value = message(e);
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function deleteTea(teaId: string): Promise<void> {
    saving.value = true;
    try {
      await api.del(`/tea/teas/${teaId}`);
      teas.value = teas.value.filter((tea) => tea.id !== teaId);
      error.value = null;
    } catch (e) {
      error.value = message(e);
    } finally {
      saving.value = false;
    }
  }

  /**
   * The everyday write: knock off what was just brewed.
   *
   * Optimistic, because the rim should answer the tap immediately at the tea
   * table. The whole record goes up because the API is a full replace, and the
   * store already holds it from the list response. On rejection the previous
   * value is put back, so the rim never shows a number that isn't on disk.
   */
  async function setGrams(teaId: string, grams: number): Promise<void> {
    const current = teas.value.find((tea) => tea.id === teaId);
    if (!current) return;

    const previous = current.grams_remaining;
    const optimistic = { ...current, grams_remaining: grams };
    teas.value = teas.value.map((tea) => (tea.id === teaId ? optimistic : tea));

    saving.value = true;
    try {
      const updated = await api.put<Tea>(`/tea/teas/${teaId}`, { ...toWrite(optimistic) });
      teas.value = teas.value.map((tea) => (tea.id === teaId ? updated : tea));
      error.value = null;
    } catch (e) {
      teas.value = teas.value.map((tea) =>
        tea.id === teaId ? { ...tea, grams_remaining: previous } : tea,
      );
      error.value = message(e);
    } finally {
      saving.value = false;
    }
  }

  async function uploadImage(teaId: string, file: File): Promise<void> {
    saving.value = true;
    try {
      const updated = await api.upload<Tea>(`/tea/teas/${teaId}/image`, file);
      teas.value = teas.value.map((tea) => (tea.id === teaId ? updated : tea));
      error.value = null;
    } catch (e) {
      error.value = message(e);
    } finally {
      saving.value = false;
    }
  }

  async function removeImage(teaId: string): Promise<void> {
    saving.value = true;
    try {
      const updated = await api.del<Tea>(`/tea/teas/${teaId}/image`);
      teas.value = teas.value.map((tea) => (tea.id === teaId ? updated : tea));
      error.value = null;
    } catch (e) {
      error.value = message(e);
    } finally {
      saving.value = false;
    }
  }

  return {
    teas,
    loading,
    saving,
    error,
    fetchTeas,
    createTea,
    replaceTea,
    deleteTea,
    setGrams,
    uploadImage,
    removeImage,
  };
});
