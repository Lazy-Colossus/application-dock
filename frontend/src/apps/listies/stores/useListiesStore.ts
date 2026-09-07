import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import { useAuthStore } from "@/stores/useAuthStore";
import { isPlace } from "@/apps/listies/types";
import {
  useSheetEvents,
  type SheetChangedEvent,
  type SheetClosedEvent,
  type SheetEventsSubscription,
  type ClosedReason,
} from "@/apps/listies/composables/useSheetEvents";
import type {
  CellValue,
  ColumnSpec,
  ColumnType,
  Place,
  PlaceGroup,
  Row,
  Sheet,
  SheetSummary,
  SheetView,
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

  // ── collaboration state for the open sheet (Stories 5.1/5.2) ─────────────
  const shared = ref(false);
  const owner = ref<string | null>(null);
  const members = ref<string[] | null>(null);
  const rev = ref(0);
  const canManage = ref(false);
  // Set when a live `sheet.closed` event ends my access; the sheet page watches
  // it to leave with a reason (Story 5.2 wires it; Story 5.3 renders the notice).
  const closedReason = ref<ClosedReason | null>(null);

  // The live SSE subscription for the open shared sheet, and the guards that
  // stop a live refetch from stomping an edit that is still in flight.
  let subscription: SheetEventsSubscription | null = null;
  let inFlightCellWrites = 0;
  let reconcilePending = false;

  function me(): string | null {
    return useAuthStore().username;
  }

  // Google Maps is optional server configuration (Story 4.1). Everything
  // place-related keys off this.
  const mapsEnabled = ref(false);
  const browserKey = ref<string | null>(null);
  const searching = ref(false);
  let mapsConfigLoaded = false;

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

  /**
   * Apply a fetched sheet view to the store, including collaboration state.
   *
   * `preserveActiveTab` keeps the tab the user is looking at across a live
   * refetch (Story 5.2); the initial load lets it fall to the first tab.
   */
  function applyView(view: SheetView, preserveActiveTab: boolean): void {
    const previousActive = activeTabId.value;
    currentSheet.value = {
      id: view.id,
      name: view.name,
      created_at: view.created_at,
      tabs: view.tabs,
    };
    shared.value = view.shared ?? false;
    owner.value = view.owner ?? null;
    members.value = view.members ?? null;
    rev.value = view.rev ?? 0;
    canManage.value = view.can_manage ?? false;

    // Tab order is authoritative; array position is not.
    const ordered = [...view.tabs].sort((a, b) => a.order - b.order);
    activeTabId.value =
      preserveActiveTab && ordered.some((t) => t.id === previousActive)
        ? previousActive
        : (ordered[0]?.id ?? null);
  }

  async function fetchSheet(sheetId: string): Promise<void> {
    loading.value = true;
    error.value = null;
    closedReason.value = null;
    try {
      const view = await api.get<SheetView>(`/listies/sheets/${sheetId}`);
      applyView(view, false);
      subscribeToSheet(sheetId);
    } catch (e) {
      closeSubscription();
      currentSheet.value = null;
      activeTabId.value = null;
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  /**
   * Refetch a live-changed sheet and re-render, preserving the tab I am on.
   *
   * Sort, map and tick state live in the sheet page's own refs (keyed by tab)
   * and are untouched by replacing `currentSheet`. If a cell write is still in
   * flight, the refetch is deferred until it lands so an optimistic value is
   * never stomped (Story 5.2, AC-10).
   */
  async function reconcile(sheetId: string): Promise<void> {
    if (inFlightCellWrites > 0) {
      reconcilePending = true;
      return;
    }
    try {
      const view = await api.get<SheetView>(`/listies/sheets/${sheetId}`);
      if (currentSheet.value?.id !== sheetId) return; // navigated away meanwhile
      applyView(view, true);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  function onSheetChanged(event: SheetChangedEvent): void {
    if (event.sheet_id !== currentSheet.value?.id) return;
    // Ignore my own write (already applied optimistically) and any rev I hold.
    if (event.actor === me()) return;
    if (event.rev <= rev.value) return;
    void reconcile(event.sheet_id);
  }

  function onSheetClosed(event: SheetClosedEvent): void {
    if (event.sheet_id !== currentSheet.value?.id) return;
    // "removed" targets one member; "unshared" spares the owner; "deleted" hits
    // everyone. Anything that does not end *my* access is ignored.
    if (event.reason === "removed" && event.member !== me()) return;
    if (event.reason === "unshared" && owner.value === me()) return;
    closeSubscription();
    closedReason.value = event.reason;
  }

  function subscribeToSheet(sheetId: string): void {
    closeSubscription();
    // Only shared sheets have a live channel; a private sheet needs no stream.
    if (!shared.value) return;
    const token = useAuthStore().token;
    if (!token) return;
    subscription = useSheetEvents(sheetId, token, {
      onChanged: onSheetChanged,
      onMembersChanged: (event) => {
        if (event.sheet_id === currentSheet.value?.id) {
          members.value = event.members;
        }
      },
      onClosed: onSheetClosed,
    });
  }

  function closeSubscription(): void {
    subscription?.close();
    subscription = null;
  }

  // ── sharing actions (Story 5.3) ─────────────────────────────────────────
  //
  // All operate on the open sheet and route failures into `error`. Owner-only
  // rejection (403) is surfaced too — hiding the controls is UX, not the guard.

  /** The platform roster for the share picker; a failure yields an empty list. */
  async function fetchUsers(): Promise<string[]> {
    try {
      const data = await api.get<{ usernames: string[] }>("/auth/users");
      return data.usernames;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      return [];
    }
  }

  function syncSummary(view: SheetView): void {
    const summary = sheets.value.find((s) => s.id === view.id);
    if (summary) {
      summary.shared = view.shared ?? false;
      summary.owner = view.owner ?? null;
    }
  }

  async function shareSheet(usernames: string[]): Promise<void> {
    const sheet = currentSheet.value;
    if (!sheet) return;
    error.value = null;
    try {
      const view = await api.post<SheetView>(
        `/listies/sheets/${sheet.id}/share`,
        { usernames },
      );
      applyView(view, true);
      subscribeToSheet(view.id); // now shared → open the live channel
      syncSummary(view);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  async function removeMember(username: string): Promise<void> {
    const sheet = currentSheet.value;
    if (!sheet) return;
    error.value = null;
    try {
      const view = await api.del<SheetView>(
        `/listies/sheets/${sheet.id}/share/${username}`,
      );
      applyView(view, true);
      syncSummary(view);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  async function stopSharing(): Promise<void> {
    const sheet = currentSheet.value;
    if (!sheet) return;
    error.value = null;
    try {
      const view = await api.del<SheetView>(
        `/listies/sheets/${sheet.id}/share`,
      );
      applyView(view, true); // now private
      subscribeToSheet(view.id); // not shared → tears the channel down
      syncSummary(view);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  /** Leave the open sheet: tear down the live stream and clear its state. */
  function closeSheet(): void {
    closeSubscription();
    currentSheet.value = null;
    activeTabId.value = null;
    shared.value = false;
    owner.value = null;
    members.value = null;
    rev.value = 0;
    canManage.value = false;
    closedReason.value = null;
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
    // Count this write as in flight so a live refetch cannot stomp the value I
    // am applying; a refetch that arrives meanwhile is deferred until it lands.
    inFlightCellWrites += 1;
    try {
      const updated = await api.put<Row>(
        `/listies/sheets/${sheet.id}/tabs/${tab.id}/rows/${rowId}`,
        { cells: { [columnId]: value } },
      );
      Object.assign(row, updated);
    } catch (e) {
      applyCell(row, columnId, previous);
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      inFlightCellWrites -= 1;
      if (inFlightCellWrites === 0 && reconcilePending) {
        reconcilePending = false;
        if (currentSheet.value) void reconcile(currentSheet.value.id);
      }
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

  /**
   * Load the maps configuration once per session.
   *
   * A failure here is deliberately silent: maps are optional, and a sheet
   * without them works perfectly well — an error banner would be noise.
   */
  async function fetchMapsConfig(): Promise<void> {
    if (mapsConfigLoaded) return;
    mapsConfigLoaded = true;
    try {
      const config = await api.get<{ enabled: boolean; browser_key?: string }>(
        "/listies/maps-config",
      );
      mapsEnabled.value = config.enabled;
      browserKey.value = config.browser_key ?? null;
    } catch {
      mapsEnabled.value = false;
      browserKey.value = null;
    }
  }

  /**
   * Search Google Places through our API.
   *
   * Deliberately separate from `loading` and `error`: a keystroke in one cell
   * must not put a spinner or a banner over the whole sheet. The caller shows
   * the failure beside the cell, which is why this rethrows.
   */
  async function searchPlaces(
    q: string,
    near?: string | null,
  ): Promise<Place[]> {
    const params = new URLSearchParams({ q });
    if (near) params.set("near", near);

    searching.value = true;
    try {
      return await api.get<Place[]>(`/listies/places/search?${params}`);
    } finally {
      searching.value = false;
    }
  }

  /**
   * The middle of the places already in a column, as `"lat,lng"`.
   *
   * Used to bias a search, so "cafe" means the right cafés rather than the
   * nearest ones to wherever Google guesses.
   */
  function placeCentroid(columnId: string): string | null {
    const points = (activeTab.value?.rows ?? [])
      .map((row) => row.cells[columnId])
      .filter(isPlace);
    if (points.length === 0) return null;

    const lat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
    const lng = points.reduce((sum, p) => sum + p.lng, 0) / points.length;
    return `${Number(lat.toFixed(6))},${Number(lng.toFixed(6))}`;
  }

  // ── tabs (Story 3.1) ───────────────────────────────────────────────────

  function setActiveTab(tabId: string): void {
    if (!currentSheet.value?.tabs.some((t) => t.id === tabId)) return;
    activeTabId.value = tabId;
  }

  async function postTab(body: Record<string, unknown>): Promise<void> {
    const sheet = currentSheet.value;
    if (!sheet) return;

    error.value = null;
    try {
      const tab = await api.post<Tab>(`/listies/sheets/${sheet.id}/tabs`, body);
      sheet.tabs.push(tab);
      activeTabId.value = tab.id;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  async function createTab(name: string, columns: ColumnSpec[]): Promise<void> {
    await postTab({ name, columns });
  }

  /** Copy another tab's column setup — the API takes one or the other. */
  async function createTabFrom(
    name: string,
    sourceTabId: string,
  ): Promise<void> {
    await postTab({ name, copy_columns_from: sourceTabId });
  }

  async function renameTab(tabId: string, name: string): Promise<void> {
    const sheet = currentSheet.value;
    if (!sheet) return;

    error.value = null;
    try {
      const updated = await api.put<Tab>(
        `/listies/sheets/${sheet.id}/tabs/${tabId}`,
        { name },
      );
      const tab = sheet.tabs.find((t) => t.id === tabId);
      if (tab) tab.name = updated.name;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  /** Set or clear a tab's accent colour; `null` clears it. */
  async function recolourTab(
    tabId: string,
    color: string | null,
  ): Promise<void> {
    const sheet = currentSheet.value;
    if (!sheet) return;

    error.value = null;
    try {
      // The API distinguishes "" (clear) from omitted (leave alone).
      const updated = await api.put<Tab>(
        `/listies/sheets/${sheet.id}/tabs/${tabId}`,
        { color: color ?? "" },
      );
      const tab = sheet.tabs.find((t) => t.id === tabId);
      if (tab) tab.color = updated.color ?? null;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  /**
   * Replace a tab's place groups (Story 4.6).
   *
   * Rides the same `PUT .../tabs/{id}` endpoint as the accent colour, mirroring
   * `recolourTab`. Setting groups never rewrites cells: a cell holding a
   * now-deleted group's id simply reads as ungrouped.
   */
  async function setPlaceGroups(
    tabId: string,
    groups: PlaceGroup[],
  ): Promise<void> {
    const sheet = currentSheet.value;
    if (!sheet) return;

    error.value = null;
    try {
      const updated = await api.put<Tab>(
        `/listies/sheets/${sheet.id}/tabs/${tabId}`,
        { place_groups: groups },
      );
      const tab = sheet.tabs.find((t) => t.id === tabId);
      if (tab) tab.place_groups = updated.place_groups ?? [];
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  async function deleteTab(tabId: string): Promise<void> {
    const sheet = currentSheet.value;
    if (!sheet) return;

    const ordered = [...sheet.tabs].sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((t) => t.id === tabId);
    // A sheet always keeps at least one tab; the server enforces it too, but
    // there is no reason to ask.
    if (index < 0 || ordered.length === 1) return;

    error.value = null;
    try {
      await api.del<void>(`/listies/sheets/${sheet.id}/tabs/${tabId}`);
      sheet.tabs = sheet.tabs.filter((t) => t.id !== tabId);
      if (activeTabId.value === tabId) {
        // The next tab along, or the previous one if this was the last.
        const neighbour = ordered[index + 1] ?? ordered[index - 1];
        activeTabId.value = neighbour?.id ?? null;
      }
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
    mapsEnabled,
    browserKey,
    searching,
    fetchMapsConfig,
    searchPlaces,
    placeCentroid,
    activeTabId,
    activeTab,
    fetchSheet,
    closeSheet,
    reconcile,
    shared,
    owner,
    members,
    rev,
    canManage,
    closedReason,
    fetchUsers,
    shareSheet,
    removeMember,
    stopSharing,
    addRow,
    commitCell,
    setActiveTab,
    createTab,
    createTabFrom,
    renameTab,
    recolourTab,
    setPlaceGroups,
    deleteTab,
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
