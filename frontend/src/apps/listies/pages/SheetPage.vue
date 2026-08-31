<template>
  <q-page class="listies-sheet q-pa-md" :style-fn="fillViewport">
    <div
      v-if="store.loading && !store.currentSheet"
      class="row justify-center q-pa-xl"
    >
      <q-spinner size="2rem" />
    </div>

    <div
      v-else-if="!store.currentSheet"
      class="column q-gutter-md"
      data-testid="not-found"
    >
      <div class="text-h6">That sheet isn’t here.</div>
      <div class="text-grey-6">{{ store.error }}</div>
      <div>
        <q-btn
          unelevated
          no-caps
          color="primary"
          label="Back to sheets"
          data-testid="back-to-sheets"
          @click="router.push('/listies')"
        />
      </div>
    </div>

    <template v-else>
      <div v-if="store.error" class="text-negative q-mb-md" data-testid="error">
        {{ store.error }}
      </div>

      <div v-if="canShowMap" class="listies-sheet__toolbar row justify-end">
        <q-btn
          dense
          flat
          no-caps
          icon="map"
          :label="mapOpen ? 'Hide map' : 'Map'"
          :color="mapOpen ? 'primary' : undefined"
          data-testid="toggle-map"
          @click="toggleMap"
        />
      </div>

      <div
        class="listies-sheet__body"
        :class="{ 'listies-sheet__body--split': mapOpen }"
        :style="accentStyle"
      >
        <SheetGrid
          v-if="store.activeTab"
          :tab="store.activeTab"
          :allow-place="store.mapsEnabled"
          :maps-enabled="store.mapsEnabled"
          :place-centroid="store.placeCentroid"
          :highlighted-row-id="selectedRowId"
          :mapped-row-ids="mapOpen ? shownRowIds : null"
          @add-row="store.addRow($event)"
          @delete-row="store.deleteRow($event)"
          @add-column="store.addColumn($event.name, $event.type)"
          @rename-column="store.renameColumn($event.columnId, $event.name)"
          @retype-column="store.retypeColumn($event.columnId, $event.type)"
          @move-column="store.moveColumn($event.columnId, $event.delta)"
          @delete-column="store.deleteColumn($event)"
          @commit-cell="
            store.commitCell($event.rowId, $event.columnId, $event.value)
          "
          @select-row="selectedRowId = $event"
          @toggle-mapped="toggleMapped"
        />

        <MapPane
          v-if="mapOpen && store.activeTab"
          class="listies-sheet__map"
          :tab="store.activeTab"
          :browser-key="store.browserKey"
          :selected-row-id="selectedRowId"
          :shown-row-ids="shownRowIds"
          @select-row="selectedRowId = $event"
          @show-all="hiddenRowIds = new Set()"
          @show-none="hiddenRowIds = new Set(placeRowIds)"
        />
      </div>

      <TabBar
        class="listies-sheet__tabs"
        :tabs="store.currentSheet.tabs"
        :active-tab-id="store.activeTabId"
        @select="store.setActiveTab($event)"
        @add="tabDialogOpen = true"
        @recolour="store.recolourTab($event.tabId, $event.color)"
        @rename="store.renameTab($event.tabId, $event.name)"
        @delete="store.deleteTab($event)"
      />

      <CreateTabDialog
        v-model="tabDialogOpen"
        :existing-tabs="store.currentSheet.tabs"
        :allow-place="store.mapsEnabled"
        @submit="createTab"
      />
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import CreateTabDialog from "@/apps/listies/components/CreateTabDialog.vue";
import MapPane from "@/apps/listies/components/MapPane.vue";
import SheetGrid from "@/apps/listies/components/SheetGrid.vue";
import TabBar from "@/apps/listies/components/TabBar.vue";
import { useListiesStore } from "@/apps/listies/stores/useListiesStore";
import { isPlace } from "@/apps/listies/types";
import { usePageDetailStore } from "@/stores/usePageDetailStore";
import type { ColumnSpec } from "@/apps/listies/types";

const store = useListiesStore();
const pageDetail = usePageDetailStore();
const route = useRoute();
const router = useRouter();
const tabDialogOpen = ref(false);
const selectedRowId = ref<string | null>(null);

// Which tabs have their map open, for this visit only. Keyed by tab so
// switching away and back does not lose it.
const openMaps = ref<Set<string>>(new Set());

const canShowMap = computed(
  () =>
    store.mapsEnabled &&
    (store.activeTab?.columns.some((column) => column.type === "place") ??
      false),
);

// Closed until asked for: the Maps SDK is the heaviest thing this app loads,
// and most tabs never want it.
const mapOpen = computed(
  () => canShowMap.value && openMaps.value.has(store.activeTabId ?? ""),
);

/**
 * Which rows are *hidden* from the map, not which are shown.
 *
 * Tracking the exceptions means a place added while the map is open is plotted
 * without being asked for — the opposite (a set of shown ids) would silently
 * leave new places off.
 */
const hiddenRowIds = ref<Set<string>>(new Set());

const placeRowIds = computed(() => {
  const tab = store.activeTab;
  if (!tab) return [];
  const placeColumns = tab.columns.filter((column) => column.type === "place");
  return tab.rows
    .filter((row) =>
      placeColumns.some((column) => isPlace(row.cells[column.id] ?? null)),
    )
    .map((row) => row.id);
});

const shownRowIds = computed(() =>
  placeRowIds.value.filter((id) => !hiddenRowIds.value.has(id)),
);

function toggleMapped(rowId: string): void {
  const next = new Set(hiddenRowIds.value);
  if (next.has(rowId)) next.delete(rowId);
  else next.add(rowId);
  hiddenRowIds.value = next;
}

// Like the sort, the ticks belong to the tab being looked at.
watch(
  () => store.activeTabId,
  () => {
    hiddenRowIds.value = new Set();
    selectedRowId.value = null;
  },
);

function toggleMap(): void {
  const tabId = store.activeTabId;
  if (!tabId) return;
  const next = new Set(openMaps.value);
  if (next.has(tabId)) next.delete(tabId);
  else next.add(tabId);
  openMaps.value = next;
}

// The sheet's name belongs in the shell's title bar — the page having its own
// header meant two titles and two back arrows stacked on top of each other.
watch(
  () => store.currentSheet?.name ?? null,
  (name) => pageDetail.setDetail(name),
  { immediate: true },
);

onUnmounted(() => pageDetail.clearDetail());

/**
 * Give the page a definite height instead of Quasar's default min-height.
 *
 * With only a minimum, a tall grid grows the page and pushes the tab bar off
 * the bottom of the screen. A definite height lets the grid scroll inside its
 * own box and keeps the bar where it belongs. `offset` is the layout's
 * header + footer height, supplied by Quasar.
 */
// The active tab's colour tints the grid, so which tab you are in is legible
// without looking down at the bar.
const accentStyle = computed(() =>
  store.activeTab?.color
    ? { "--listies-accent": store.activeTab.color }
    : undefined,
);

function fillViewport(offset: number): Record<string, string> {
  return { height: offset ? `calc(100vh - ${offset}px)` : "100vh" };
}

function load(): void {
  void store.fetchMapsConfig();
  const sheetId = String(route.params.sheetId ?? "");
  if (sheetId) void store.fetchSheet(sheetId);
}

onMounted(load);
// The route param can change without remounting the page.
watch(() => route.params.sheetId, load);

async function createTab(payload: {
  name: string;
  columns?: ColumnSpec[];
  copyColumnsFrom?: string;
}): Promise<void> {
  if (payload.copyColumnsFrom) {
    await store.createTabFrom(payload.name, payload.copyColumnsFrom);
  } else {
    await store.createTab(payload.name, payload.columns ?? []);
  }
  if (!store.error) tabDialogOpen.value = false;
}
</script>

<style scoped>
.listies-sheet__toolbar {
  margin-bottom: 0.25rem;
}

/* Header, grid, tab bar — the grid takes the slack and scrolls inside itself,
   so the bar stays on screen however many rows there are. */
.listies-sheet {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.listies-sheet__body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* Grid left, map right. Declared AFTER the base rule: both are single-class
   selectors, so source order decides which flex-direction wins. */
.listies-sheet__body--split {
  flex-direction: row;
  gap: 0.75rem;
}

.listies-sheet__body--split > :first-child {
  flex: 1 1 60%;
  min-width: 0;
}

.listies-sheet__map {
  flex: 1 1 40%;
  min-width: 18rem;
}

.listies-sheet__tabs {
  flex: 0 0 auto;
  background: var(--q-dark-page, #1d1d1d);
  margin-top: 0.5rem;
}
</style>
