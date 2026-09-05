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

      <div
        v-if="showToolbar"
        class="listies-sheet__toolbar row justify-end items-center q-gutter-xs"
      >
        <q-chip
          v-if="store.shared"
          dense
          icon="group"
          :label="collaboratorLabel"
          :clickable="canShare"
          data-testid="collaborators"
          @click="canShare && (shareDialogOpen = true)"
        >
          <q-tooltip>{{ (store.members ?? []).join(", ") }}</q-tooltip>
        </q-chip>
        <q-btn
          v-else-if="canShare"
          dense
          flat
          no-caps
          icon="person_add"
          label="Share"
          color="primary"
          data-testid="share-button"
          @click="shareDialogOpen = true"
        />
        <q-space />
        <q-btn
          v-if="filterCount > 0"
          dense
          flat
          no-caps
          icon="filter_list"
          :label="`Filters (${filterCount})`"
          color="primary"
          data-testid="clear-filters"
          @click="clearFilters"
        />
        <q-btn
          v-if="hasGroupColumn"
          dense
          flat
          no-caps
          icon="palette"
          label="Groups"
          data-testid="toggle-groups"
        >
          <q-menu
            anchor="bottom right"
            self="top right"
            data-testid="groups-menu"
          >
            <GroupManager
              :groups="store.activeTab?.place_groups ?? []"
              @save="saveGroups"
            />
          </q-menu>
        </q-btn>
        <q-btn
          v-if="canShowMap"
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
          :filters="filters"
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
          @set-filter="onSetFilter"
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

      <!-- Owner-only: the dialog is never instantiated for a non-owner member. -->
      <ShareSheetDialog v-if="canShare" v-model="shareDialogOpen" />
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useQuasar } from "quasar";
import CreateTabDialog from "@/apps/listies/components/CreateTabDialog.vue";
import ShareSheetDialog from "@/apps/listies/components/ShareSheetDialog.vue";
import GroupManager from "@/apps/listies/components/GroupManager.vue";
import MapPane from "@/apps/listies/components/MapPane.vue";
import SheetGrid from "@/apps/listies/components/SheetGrid.vue";
import TabBar from "@/apps/listies/components/TabBar.vue";
import { useListiesStore } from "@/apps/listies/stores/useListiesStore";
import { isPlace } from "@/apps/listies/types";
import { activeFilterCount, isActive } from "@/apps/listies/filter";
import type { FilterSpec } from "@/apps/listies/filter";
import { usePageDetailStore } from "@/stores/usePageDetailStore";
import type { ColumnSpec, PlaceGroup } from "@/apps/listies/types";

const store = useListiesStore();
const pageDetail = usePageDetailStore();
const route = useRoute();
const router = useRouter();
const $q = useQuasar();

// When a live event ends my access to the sheet, leave for the home list and
// say why (Story 5.2 wires the reaction; Story 5.3 polishes the copy).
const CLOSED_MESSAGE: Record<string, string> = {
  removed: "You were removed from this sheet.",
  unshared: "This sheet is no longer shared.",
  deleted: "This sheet was deleted.",
};

watch(
  () => store.closedReason,
  (reason) => {
    if (!reason) return;
    $q?.notify?.({
      type: "warning",
      message: CLOSED_MESSAGE[reason] ?? "This sheet is no longer available.",
    });
    void router.push("/listies");
  },
);
const tabDialogOpen = ref(false);
const shareDialogOpen = ref(false);
const selectedRowId = ref<string | null>(null);

// I can share when the sheet is mine to share: a private sheet I own, or a
// shared sheet I am the owner of. A non-owner member sees collaborators but no
// controls, and never gets the dialog instantiated.
const canShare = computed(() => !store.shared || store.canManage);
const collaboratorLabel = computed(() => {
  const count = (store.members ?? []).length;
  return count === 1 ? "1 person" : `${count} people`;
});

// Which tabs have their map open, for this visit only. Keyed by tab so
// switching away and back does not lose it.
const openMaps = ref<Set<string>>(new Set());

const canShowMap = computed(
  () =>
    store.mapsEnabled &&
    (store.activeTab?.columns.some((column) => column.type === "place") ??
      false),
);

// The Groups button appears whenever the tab has a group column — whether or
// not maps are configured, since a group is a label until there is a map.
const hasGroupColumn = computed(
  () =>
    store.activeTab?.columns.some((column) => column.type === "place_group") ??
    false,
);

function saveGroups(groups: PlaceGroup[]): void {
  if (store.activeTabId) void store.setPlaceGroups(store.activeTabId, groups);
}

// Active filters by column id — a view, held here so the toolbar can show the
// count and clear them (Story 2.9). Reset when the tab changes.
const filters = ref<Record<string, FilterSpec>>({});
const filterCount = computed(() => activeFilterCount(filters.value));

// The toolbar row also carries the share affordance, so it shows whenever there
// is anything to put in it — collaborators, a share entry, map, groups, filters.
const showToolbar = computed(
  () =>
    store.shared ||
    canShare.value ||
    canShowMap.value ||
    hasGroupColumn.value ||
    filterCount.value > 0,
);

function onSetFilter(payload: {
  columnId: string;
  spec: FilterSpec | null;
}): void {
  const next = { ...filters.value };
  if (payload.spec && isActive(payload.spec)) {
    next[payload.columnId] = payload.spec;
  } else {
    delete next[payload.columnId];
  }
  filters.value = next;
}

function clearFilters(): void {
  filters.value = {};
}

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

// Like the sort, the ticks and the filters belong to the tab being looked at.
watch(
  () => store.activeTabId,
  () => {
    hiddenRowIds.value = new Set();
    selectedRowId.value = null;
    filters.value = {};
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

onUnmounted(() => {
  pageDetail.clearDetail();
  // Tear down the live SSE subscription when leaving the sheet.
  store.closeSheet();
});

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
  if (!sheetId) return;
  void store.fetchSheet(sheetId).then(() => {
    // Arriving via the home "Share…" entry (…?share=1) opens the dialog once
    // the sheet is loaded and only if it is mine to manage.
    if (route.query?.share && canShare.value && store.currentSheet) {
      shareDialogOpen.value = true;
    }
  });
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
