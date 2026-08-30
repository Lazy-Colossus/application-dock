import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type {
  CellValue,
  ColumnSpec,
  Row,
  Sheet,
  SheetSummary,
  Tab,
} from "@/apps/listies/types";

function summarise(sheet: Sheet): SheetSummary {
  return {
    id: sheet.id,
    name: sheet.name,
    tab_count: sheet.tabs.length,
    row_count: sheet.tabs.reduce((total, tab) => total + tab.rows.length, 0),
    created_at: sheet.created_at,
  };
}

// Empty means the key is absent, never `null` stored in the map — that keeps
// the client's shape identical to what the server persists.
function applyCell(row: Row, columnId: string, value: CellValue): void {
  if (value === null) {
    delete row.cells[columnId];
  } else {
    row.cells[columnId] = value;
  }
}

export const useListiesStore = defineStore("listies", () => {
  const sheets = ref<SheetSummary[]>([]);
  const currentSheet = ref<Sheet | null>(null);
  const activeTabId = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const activeTab = computed<Tab | null>(
    () =>
      currentSheet.value?.tabs.find((t) => t.id === activeTabId.value) ?? null,
  );

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

  async function fetchSheet(sheetId: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const sheet = await api.get<Sheet>(`/listies/sheets/${sheetId}`);
      currentSheet.value = sheet;
      // Tab order is authoritative; array position is not.
      activeTabId.value =
        [...sheet.tabs].sort((a, b) => a.order - b.order)[0]?.id ?? null;
    } catch (e) {
      currentSheet.value = null;
      activeTabId.value = null;
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  async function addRow(cells: Record<string, CellValue> = {}): Promise<void> {
    const sheet = currentSheet.value;
    const tab = activeTab.value;
    if (!sheet || !tab) return;

    loading.value = true;
    error.value = null;
    try {
      const row = await api.post<Row>(
        `/listies/sheets/${sheet.id}/tabs/${tab.id}/rows`,
        { cells },
      );
      tab.rows.push(row);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  /**
   * Write one cell, optimistically.
   *
   * The grid shows the new value immediately and stays interactive — this
   * deliberately does NOT touch `loading`, which would gate the whole page on
   * a keystroke. On failure the previous value is put back and the message is
   * surfaced in `error`.
   */
  async function commitCell(
    rowId: string,
    columnId: string,
    value: CellValue,
  ): Promise<void> {
    const sheet = currentSheet.value;
    const tab = activeTab.value;
    const row = tab?.rows.find((r) => r.id === rowId);
    if (!sheet || !tab || !row) return;

    const previous = row.cells[columnId] ?? null;
    applyCell(row, columnId, value);

    error.value = null;
    try {
      const updated = await api.put<Row>(
        `/listies/sheets/${sheet.id}/tabs/${tab.id}/rows/${rowId}`,
        { cells: { [columnId]: value } },
      );
      Object.assign(row, updated);
    } catch (e) {
      applyCell(row, columnId, previous);
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  return {
    sheets,
    currentSheet,
    activeTabId,
    activeTab,
    fetchSheet,
    addRow,
    commitCell,
    loading,
    error,
    fetchSheets,
    createSheet,
    renameSheet,
    deleteSheet,
  };
});
