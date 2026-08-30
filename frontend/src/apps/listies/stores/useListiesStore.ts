import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { ColumnSpec, Sheet, SheetSummary } from "@/apps/listies/types";

function summarise(sheet: Sheet): SheetSummary {
  return {
    id: sheet.id,
    name: sheet.name,
    tab_count: sheet.tabs.length,
    row_count: sheet.tabs.reduce((total, tab) => total + tab.rows.length, 0),
    created_at: sheet.created_at,
  };
}

export const useListiesStore = defineStore("listies", () => {
  const sheets = ref<SheetSummary[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchSheets(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      sheets.value = await api.get<SheetSummary[]>("/listies/sheets");
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  async function createSheet(
    name: string,
    columns: ColumnSpec[],
  ): Promise<Sheet> {
    loading.value = true;
    error.value = null;
    try {
      const created = await api.post<Sheet>("/listies/sheets", {
        name,
        columns,
      });
      sheets.value.push(summarise(created));
      return created;
    } catch (e) {
      // Surface the error AND rethrow so the caller can skip navigating.
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function renameSheet(sheetId: string, name: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const updated = await api.put<Sheet>(`/listies/sheets/${sheetId}`, {
        name,
      });
      const summary = sheets.value.find((s) => s.id === sheetId);
      if (summary) summary.name = updated.name;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  async function deleteSheet(sheetId: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.del<void>(`/listies/sheets/${sheetId}`);
      sheets.value = sheets.value.filter((s) => s.id !== sheetId);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  return {
    sheets,
    loading,
    error,
    fetchSheets,
    createSheet,
    renameSheet,
    deleteSheet,
  };
});
