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
        @commit-cell="
          store.commitCell($event.rowId, $event.columnId, $event.value)
        "
      />
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import SheetGrid from "@/apps/listies/components/SheetGrid.vue";
import { useListiesStore } from "@/apps/listies/stores/useListiesStore";

const store = useListiesStore();
const route = useRoute();
const router = useRouter();

function load(): void {
  const sheetId = String(route.params.sheetId ?? "");
  if (sheetId) void store.fetchSheet(sheetId);
}

onMounted(load);
// The route param can change without remounting the page.
watch(() => route.params.sheetId, load);
</script>
