<template>
  <q-page class="context-switch-app column no-wrap q-pa-md">
    <div class="text-h5 q-mb-md">Context-Switch</div>

    <div class="row items-center q-gutter-sm q-mb-lg">
      <q-input
        v-model="newName"
        dense
        outlined
        placeholder="New list name"
        data-testid="new-list-input"
        @keyup.enter="onCreate"
      />
      <q-btn
        label="New list"
        color="primary"
        unelevated
        no-caps
        :disable="!canCreate"
        data-testid="create-list-btn"
        @click="onCreate"
      />
    </div>

    <div v-if="store.error" class="text-negative q-mb-md" data-testid="error">
      {{ store.error }}
    </div>

    <div
      v-if="!store.loading && store.lists.length === 0"
      class="text-grey-6"
      data-testid="empty-state"
    >
      No lists yet — create your first one above.
    </div>

    <q-list v-else separator>
      <q-item
        v-for="list in store.lists"
        :key="list.id"
        clickable
        :data-testid="`list-${list.id}`"
        @click="openList(list.id)"
      >
        <q-item-section>
          <q-input
            v-if="editingId === list.id"
            v-model="editName"
            dense
            outlined
            :data-testid="`rename-input-${list.id}`"
            @click.stop
            @keyup.enter="saveRename(list.id)"
          />
          <template v-else>{{ list.name }}</template>
        </q-item-section>

        <q-item-section side>
          <div class="row items-center q-gutter-xs">
            <template v-if="editingId === list.id">
              <q-btn
                dense
                flat
                no-caps
                label="Save"
                :data-testid="`rename-save-${list.id}`"
                @click.stop="saveRename(list.id)"
              />
              <q-btn
                dense
                flat
                no-caps
                label="Cancel"
                :data-testid="`rename-cancel-${list.id}`"
                @click.stop="editingId = null"
              />
            </template>

            <template v-else-if="confirmingId === list.id">
              <span class="text-caption q-mr-xs">Delete?</span>
              <q-btn
                dense
                flat
                no-caps
                color="negative"
                label="Yes"
                :data-testid="`delete-confirm-${list.id}`"
                @click.stop="confirmDelete(list.id)"
              />
              <q-btn
                dense
                flat
                no-caps
                label="No"
                :data-testid="`delete-cancel-${list.id}`"
                @click.stop="confirmingId = null"
              />
            </template>

            <template v-else>
              <span class="text-caption text-grey-6">{{
                list.active_count
              }}</span>
              <q-btn
                dense
                flat
                round
                icon="edit"
                :data-testid="`rename-${list.id}`"
                @click.stop="startRename(list)"
              />
              <q-btn
                dense
                flat
                round
                icon="delete"
                :data-testid="`delete-${list.id}`"
                @click.stop="confirmingId = list.id"
              />
            </template>
          </div>
        </q-item-section>
      </q-item>
    </q-list>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useContextSwitchStore } from "@/apps/context-switch/stores/useContextSwitchStore";
import type { ListSummary } from "@/apps/context-switch/types";

const store = useContextSwitchStore();
const router = useRouter();

const newName = ref("");
const canCreate = computed(() => newName.value.trim().length > 0);

// Per-row edit / delete-confirm state (only one row at a time).
const editingId = ref<string | null>(null);
const editName = ref("");
const confirmingId = ref<string | null>(null);

onMounted(() => {
  void store.fetchLists();
});

function openList(id: string): void {
  void router.push(`/context-switch/lists/${id}`);
}

async function onCreate(): Promise<void> {
  if (!canCreate.value) return;
  try {
    const created = await store.createList(newName.value);
    newName.value = "";
    void router.push(`/context-switch/lists/${created.id}`);
  } catch {
    // Failure is surfaced via store.error; stay on the picker.
  }
}

function startRename(list: ListSummary): void {
  editingId.value = list.id;
  editName.value = list.name;
  confirmingId.value = null;
}

async function saveRename(id: string): Promise<void> {
  if (editName.value.trim().length === 0) return;
  try {
    await store.renameList(id, editName.value);
    editingId.value = null;
  } catch {
    // Surfaced via store.error; stay in edit mode.
  }
}

async function confirmDelete(id: string): Promise<void> {
  try {
    await store.deleteList(id);
  } catch {
    // Surfaced via store.error.
  } finally {
    confirmingId.value = null;
  }
}
</script>
