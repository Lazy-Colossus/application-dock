import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type {
  CellValue,
  ColumnSpec,
  ColumnType,
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

  async function deleteRow(rowId: string): Promise<void> {
    const sheet = currentSheet.value;
    const tab = activeTab.value;
    if (!sheet || !tab || !tab.rows.some((r) => r.id === rowId)) return;

    error.value = null;
    try {
      await api.del<void>(
        `/listies/sheets/${sheet.id}/tabs/${tab.id}/rows/${rowId}`,
      );
      tab.rows = tab.rows.filter((r) => r.id !== rowId);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  // ── tabs (Story 3.1) ───────────────────────────────────────────────────

  function setActiveTab(tabId: string): void {
    if (!currentSheet.value?.tabs.some((t) => t.id === tabId)) return;
    activeTabId.value = tabId;
  }

  async function createTab(name: string, columns: ColumnSpec[]): Promise<void> {
    const sheet = currentSheet.value;
    if (!sheet) return;

    error.value = null;
    try {
      const tab = await api.post<Tab>(`/listies/sheets/${sheet.id}/tabs`, {
        name,
        columns,
      });
      sheet.tabs.push(tab);
      activeTabId.value = tab.id;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  // ── columns (Story 2.5) ────────────────────────────────────────────────
  //
  // Every column write returns the whole tab: a retype can rewrite many rows
  // and a reorder changes every column's order, so replacing the tab wholesale
  // is simpler and safer than reconciling deltas.

  function tabUrl(): string | null {
    const sheet = currentSheet.value;
    const tab = activeTab.value;
    return sheet && tab ? `/listies/sheets/${sheet.id}/tabs/${tab.id}` : null;
  }

  function replaceActiveTab(updated: Tab): void {
    const sheet = currentSheet.value;
    if (!sheet) return;
    const index = sheet.tabs.findIndex((t) => t.id === updated.id);
    if (index >= 0) sheet.tabs[index] = updated;
  }

  async function columnWrite(
    write: (url: string) => Promise<Tab>,
  ): Promise<void> {
    const url = tabUrl();
    if (!url) return;
    error.value = null;
    try {
      replaceActiveTab(await write(url));
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  async function addColumn(name: string, type: ColumnType): Promise<void> {
    await columnWrite((url) => api.post<Tab>(`${url}/columns`, { name, type }));
  }

  async function renameColumn(columnId: string, name: string): Promise<void> {
    await columnWrite((url) =>
      api.put<Tab>(`${url}/columns/${columnId}`, { name }),
    );
  }

  async function retypeColumn(
    columnId: string,
    type: ColumnType,
  ): Promise<void> {
    await columnWrite((url) =>
      api.put<Tab>(`${url}/columns/${columnId}`, { type }),
    );
  }

  /** Swap a column with its neighbour; a no-op at either edge. */
  async function moveColumn(columnId: string, delta: number): Promise<void> {
    const tab = activeTab.value;
    if (!tab) return;

    const ids = [...tab.columns]
      .sort((a, b) => a.order - b.order)
      .map((c) => c.id);
    const from = ids.indexOf(columnId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];

    await columnWrite((url) =>
      api.put<Tab>(`${url}/columns/order`, { column_ids: ids }),
    );
  }

  async function deleteColumn(columnId: string): Promise<void> {
    const url = tabUrl();
    const tab = activeTab.value;
    if (!url || !tab) return;

    error.value = null;
    try {
      await api.del<void>(`${url}/columns/${columnId}`);
      tab.columns = tab.columns.filter((c) => c.id !== columnId);
      for (const row of tab.rows) delete row.cells[columnId];
    } catch (e) {
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
    setActiveTab,
    createTab,
    deleteRow,
    addColumn,
    renameColumn,
    retypeColumn,
    moveColumn,
    deleteColumn,
    loading,
    error,
    fetchSheets,
    createSheet,
    renameSheet,
    deleteSheet,
  };
});
