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
          <q-input
            v-if="renamingId === sheet.id"
            v-model="renameDraft"
            dense
            outlined
            autofocus
            :data-testid="`rename-input-${sheet.id}`"
            @click.stop
            @keyup.enter="saveRename(sheet.id)"
          />
          <template v-else>
            <q-item-label>
              {{ sheet.name }}
              <q-badge
                v-if="sheet.shared"
                color="primary"
                class="q-ml-xs"
                :label="sharedLabel(sheet)"
                :data-testid="`shared-badge-${sheet.id}`"
              />
            </q-item-label>
            <q-item-label caption>
              {{ sheet.row_count }}
              {{ sheet.row_count === 1 ? "row" : "rows" }} ·
              {{ sheet.tab_count }} {{ sheet.tab_count === 1 ? "tab" : "tabs" }}
            </q-item-label>
          </template>
        </q-item-section>

        <q-item-section side>
          <div class="row items-center q-gutter-xs">
            <template v-if="renamingId === sheet.id">
              <q-btn
                dense
                flat
                no-caps
                label="Save"
                :disable="!renameDraft.trim()"
                :data-testid="`rename-save-${sheet.id}`"
                @click.stop="saveRename(sheet.id)"
              />
              <q-btn
                dense
                flat
                no-caps
                label="Cancel"
                :data-testid="`rename-cancel-${sheet.id}`"
                @click.stop="renamingId = null"
              />
            </template>

            <template v-else-if="confirmingId === sheet.id">
              <span class="text-caption q-mr-xs">Delete this sheet?</span>
              <q-btn
                dense
                flat
                no-caps
                color="negative"
                label="Delete"
                :data-testid="`delete-confirm-${sheet.id}`"
                @click.stop="confirmDelete(sheet.id)"
              />
              <q-btn
                dense
                flat
                no-caps
                label="Keep"
                :data-testid="`delete-cancel-${sheet.id}`"
                @click.stop="confirmingId = null"
              />
            </template>

            <template v-else>
              <q-btn
                v-if="isMine(sheet)"
                dense
                flat
                round
                icon="person_add"
                :data-testid="`share-${sheet.id}`"
                @click.stop="openShare(sheet.id)"
              />
              <q-btn
                dense
                flat
                round
                icon="edit"
                :data-testid="`rename-${sheet.id}`"
                @click.stop="startRename(sheet)"
              />
              <!-- Only the owner deletes a shared sheet; a member has no delete. -->
              <q-btn
                v-if="isMine(sheet)"
                dense
                flat
                round
                icon="delete"
                :data-testid="`delete-${sheet.id}`"
                @click.stop="confirmingId = sheet.id"
              />
            </template>
          </div>
        </q-item-section>
      </q-item>
    </q-list>

    <CreateSheetDialog
      v-model="dialogOpen"
      :allow-place="store.mapsEnabled"
      @submit="create"
    />
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import CreateSheetDialog from "@/apps/listies/components/CreateSheetDialog.vue";
import { useListiesStore } from "@/apps/listies/stores/useListiesStore";
import { useAuthStore } from "@/stores/useAuthStore";
import type { ColumnSpec, SheetSummary } from "@/apps/listies/types";

const store = useListiesStore();
const auth = useAuthStore();
const router = useRouter();
const dialogOpen = ref(false);
const renamingId = ref<string | null>(null);
const renameDraft = ref("");
const confirmingId = ref<string | null>(null);

const me = computed(() => auth.username);

// A private sheet is always mine; a shared sheet is "mine to manage" only when
// I own it. Shared-with-me sheets show a "shared by {owner}" badge and no
// share/delete controls.
function isMine(sheet: SheetSummary): boolean {
  return !sheet.shared || sheet.owner === me.value;
}

function sharedLabel(sheet: SheetSummary): string {
  return sheet.owner && sheet.owner !== me.value
    ? `shared by ${sheet.owner}`
    : "shared";
}

function openShare(sheetId: string): void {
  // Take the sharing surface to the sheet page, which opens the dialog.
  void router.push(`/listies/sheets/${sheetId}?share=1`);
}

onMounted(() => {
  void store.fetchSheets();
  // Whether the `place` column type can be offered at all (Story 4.1).
  void store.fetchMapsConfig();
});

function open(sheetId: string): void {
  // A row click opens the sheet, but not while that row is mid-edit.
  if (renamingId.value === sheetId || confirmingId.value === sheetId) return;
  void router.push(`/listies/sheets/${sheetId}`);
}

function startRename(sheet: SheetSummary): void {
  confirmingId.value = null;
  renamingId.value = sheet.id;
  renameDraft.value = sheet.name;
}

async function saveRename(sheetId: string): Promise<void> {
  const name = renameDraft.value.trim();
  if (!name) return;
  await store.renameSheet(sheetId, name);
  renamingId.value = null;
}

async function confirmDelete(sheetId: string): Promise<void> {
  await store.deleteSheet(sheetId);
  confirmingId.value = null;
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
