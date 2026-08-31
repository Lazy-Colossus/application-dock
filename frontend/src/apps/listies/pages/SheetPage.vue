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

      <div class="listies-sheet__body" :style="accentStyle">
        <SheetGrid
          v-if="store.activeTab"
          :tab="store.activeTab"
          :allow-place="store.mapsEnabled"
          :maps-enabled="store.mapsEnabled"
          :place-centroid="store.placeCentroid"
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
import SheetGrid from "@/apps/listies/components/SheetGrid.vue";
import TabBar from "@/apps/listies/components/TabBar.vue";
import { useListiesStore } from "@/apps/listies/stores/useListiesStore";
import { usePageDetailStore } from "@/stores/usePageDetailStore";
import type { ColumnSpec } from "@/apps/listies/types";

const store = useListiesStore();
const pageDetail = usePageDetailStore();
const route = useRoute();
const router = useRouter();
const tabDialogOpen = ref(false);

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

.listies-sheet__tabs {
  flex: 0 0 auto;
  background: var(--q-dark-page, #1d1d1d);
  margin-top: 0.5rem;
}
</style>
