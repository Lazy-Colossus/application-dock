<template>
  <div class="tab-bar row items-center no-wrap">
    <q-btn
      v-for="tab in orderedTabs"
      :key="tab.id"
      dense
      no-caps
      size="sm"
      class="tab-bar__chip"
      :color="tab.id === activeTabId ? 'primary' : undefined"
      :outline="tab.id !== activeTabId"
      :unelevated="tab.id === activeTabId"
      :label="tab.name"
      :data-testid="`tab-chip-${tab.id}`"
      @click="select(tab.id)"
    >
      <q-menu :data-testid="`tab-menu-${tab.id}`" context-menu>
        <q-list dense style="min-width: 12rem">
          <template v-if="renamingId === tab.id">
            <q-item>
              <q-item-section>
                <q-input
                  v-model="draftName"
                  dense
                  outlined
                  autofocus
                  data-testid="tab-rename-input"
                  @keyup.enter="saveRename(tab.id)"
                />
              </q-item-section>
            </q-item>
            <q-item>
              <q-item-section>
                <div class="row justify-end q-gutter-xs">
                  <q-btn
                    dense
                    flat
                    no-caps
                    label="Cancel"
                    data-testid="tab-rename-cancel"
                    @click="reset"
                  />
                  <q-btn
                    dense
                    flat
                    no-caps
                    color="primary"
                    label="Save"
                    :disable="!draftName.trim()"
                    data-testid="tab-rename-save"
                    @click="saveRename(tab.id)"
                  />
                </div>
              </q-item-section>
            </q-item>
          </template>

          <template v-else-if="confirmingId === tab.id">
            <q-item>
              <q-item-section>
                <div class="text-caption">
                  Delete “{{ tab.name }}” and its {{ tab.rows.length }}
                  {{ tab.rows.length === 1 ? "row" : "rows" }}?
                </div>
              </q-item-section>
            </q-item>
            <q-item>
              <q-item-section>
                <div class="row justify-end q-gutter-xs">
                  <q-btn
                    dense
                    flat
                    no-caps
                    label="Keep"
                    data-testid="tab-delete-cancel"
                    @click="reset"
                  />
                  <q-btn
                    dense
                    flat
                    no-caps
                    color="negative"
                    label="Delete"
                    data-testid="tab-delete-confirm"
                    @click="confirmDelete(tab.id)"
                  />
                </div>
              </q-item-section>
            </q-item>
          </template>

          <template v-else>
            <q-item
              clickable
              :data-testid="`tab-rename-${tab.id}`"
              @click="startRename(tab)"
            >
              <q-item-section>Rename…</q-item-section>
            </q-item>
            <q-item
              v-if="canDelete"
              clickable
              :data-testid="`tab-delete-${tab.id}`"
              @click="confirmingId = tab.id"
            >
              <q-item-section class="text-negative">Delete tab…</q-item-section>
            </q-item>
          </template>
        </q-list>
      </q-menu>
    </q-btn>

    <q-btn
      dense
      flat
      round
      size="sm"
      icon="add"
      data-testid="add-tab"
      @click="emit('add')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { Tab } from "@/apps/listies/types";

const props = defineProps<{ tabs: Tab[]; activeTabId: string | null }>();
const emit = defineEmits<{
  select: [tabId: string];
  add: [];
  rename: [payload: { tabId: string; name: string }];
  delete: [tabId: string];
}>();

const orderedTabs = computed(() =>
  [...props.tabs].sort((a, b) => a.order - b.order),
);

// A sheet always keeps at least one tab, so the last one has no delete.
const canDelete = computed(() => props.tabs.length > 1);

const renamingId = ref<string | null>(null);
const confirmingId = ref<string | null>(null);
const draftName = ref("");

function select(tabId: string): void {
  if (tabId === props.activeTabId) return;
  emit("select", tabId);
}

function reset(): void {
  renamingId.value = null;
  confirmingId.value = null;
}

function startRename(tab: Tab): void {
  confirmingId.value = null;
  renamingId.value = tab.id;
  draftName.value = tab.name;
}

function saveRename(tabId: string): void {
  const name = draftName.value.trim();
  if (!name) return;
  emit("rename", { tabId, name });
  reset();
}

function confirmDelete(tabId: string): void {
  emit("delete", tabId);
  reset();
}
</script>

<style scoped>
/* Anchored at the bottom of the sheet, the way a spreadsheet's sheet tabs are.
   Scrolls sideways once there are more tabs than fit (NFR-1). */
.tab-bar {
  gap: 0.35rem;
  overflow-x: auto;
  padding: 0.5rem 0.25rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.tab-bar__chip {
  flex: 0 0 auto;
}
</style>
