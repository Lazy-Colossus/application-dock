<template>
  <q-page class="listies-sheet q-pa-md">
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
      <div class="row items-center q-gutter-sm q-mb-md">
        <q-btn
          dense
          flat
          round
          icon="arrow_back"
          data-testid="back-to-sheets"
          @click="router.push('/listies')"
        />
        <div class="text-h5">{{ store.currentSheet.name }}</div>
      </div>

      <div v-if="store.error" class="text-negative q-mb-md" data-testid="error">
        {{ store.error }}
      </div>

      <SheetGrid
        v-if="store.activeTab"
        :tab="store.activeTab"
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

      <TabBar
        class="listies-sheet__tabs"
        :tabs="store.currentSheet.tabs"
        :active-tab-id="store.activeTabId"
        @select="store.setActiveTab($event)"
        @add="tabDialogOpen = true"
      />

      <CreateTabDialog
        v-model="tabDialogOpen"
        :existing-tabs="store.currentSheet.tabs"
        @submit="createTab"
      />
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import CreateTabDialog from "@/apps/listies/components/CreateTabDialog.vue";
import SheetGrid from "@/apps/listies/components/SheetGrid.vue";
import TabBar from "@/apps/listies/components/TabBar.vue";
import { useListiesStore } from "@/apps/listies/stores/useListiesStore";
import type { ColumnSpec } from "@/apps/listies/types";

const store = useListiesStore();
const route = useRoute();
const router = useRouter();
const tabDialogOpen = ref(false);

function load(): void {
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
/* The tab switcher lives at the bottom of the sheet, framing the grid the way
   a spreadsheet's sheet tabs do. */
.listies-sheet__tabs {
  position: sticky;
  bottom: 0;
  background: var(--q-dark-page, #1d1d1d);
  margin-top: 0.5rem;
}
</style>
