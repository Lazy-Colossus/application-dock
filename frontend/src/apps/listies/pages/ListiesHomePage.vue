<template>
  <q-page class="listies-home q-pa-md">
    <div class="row items-center justify-between q-mb-lg">
      <div class="text-h5">Listies</div>
      <q-btn
        unelevated
        no-caps
        color="primary"
        icon="add"
        label="New sheet"
        data-testid="new-sheet"
        @click="dialogOpen = true"
      />
    </div>

    <div v-if="store.error" class="text-negative q-mb-md" data-testid="error">
      {{ store.error }}
    </div>

    <div
      v-else-if="!store.loading && store.sheets.length === 0"
      class="text-grey-6"
      data-testid="empty-state"
    >
      No sheets yet — create your first one to start a list.
    </div>

    <q-list v-else separator>
      <q-item
        v-for="sheet in store.sheets"
        :key="sheet.id"
        clickable
        :data-testid="`sheet-${sheet.id}`"
        @click="open(sheet.id)"
      >
        <q-item-section>
          <q-item-label>{{ sheet.name }}</q-item-label>
          <q-item-label caption>
            {{ sheet.row_count }} {{ sheet.row_count === 1 ? "row" : "rows" }} ·
            {{ sheet.tab_count }} {{ sheet.tab_count === 1 ? "tab" : "tabs" }}
          </q-item-label>
        </q-item-section>
      </q-item>
    </q-list>

    <CreateSheetDialog v-model="dialogOpen" @submit="create" />
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import CreateSheetDialog from "@/apps/listies/components/CreateSheetDialog.vue";
import { useListiesStore } from "@/apps/listies/stores/useListiesStore";
import type { ColumnSpec } from "@/apps/listies/types";

const store = useListiesStore();
const router = useRouter();
const dialogOpen = ref(false);

onMounted(() => {
  void store.fetchSheets();
});

function open(sheetId: string): void {
  void router.push(`/listies/sheets/${sheetId}`);
}

async function create(payload: {
  name: string;
  columns: ColumnSpec[];
}): Promise<void> {
  try {
    const sheet = await store.createSheet(payload.name, payload.columns);
    dialogOpen.value = false;
    open(sheet.id);
  } catch {
    // createSheet already routed the message into store.error; stay put.
  }
}
</script>
