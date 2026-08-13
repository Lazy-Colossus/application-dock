<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="cs-archive" data-testid="archive-drawer">
      <div class="cs-archive-title">Archive</div>

      <div
        v-if="archived.length === 0"
        class="cs-archive-empty"
        data-testid="archived-empty"
      >
        Nothing archived yet.
      </div>

      <div
        v-for="todo in archived"
        v-else
        :key="todo.id"
        class="cs-archive-item"
        :style="{ borderLeftColor: todo.color }"
        :data-testid="`archived-item-${todo.id}`"
      >
        <div class="cs-archive-body">
          <div class="cs-archive-header">{{ todo.header }}</div>
          <div v-if="todo.body" class="cs-archive-text">{{ todo.body }}</div>
          <div v-if="todo.archived_at" class="cs-archive-at">
            Archived {{ formatAt(todo.archived_at) }}
          </div>
        </div>

        <div class="cs-archive-actions">
          <template v-if="confirmingId === todo.id">
            <span class="cs-archive-confirm">Delete for good?</span>
            <q-btn
              flat
              dense
              no-caps
              color="negative"
              label="Yes"
              :data-testid="`archived-delete-confirm-${todo.id}`"
              @click="confirmDelete(todo.id)"
            />
            <q-btn
              flat
              dense
              no-caps
              label="No"
              :data-testid="`archived-delete-cancel-${todo.id}`"
              @click="confirmingId = null"
            />
          </template>
          <q-btn
            v-else
            flat
            dense
            round
            color="negative"
            icon="delete"
            :data-testid="`archived-delete-${todo.id}`"
            @click="confirmingId = todo.id"
          />
        </div>
      </div>

      <div class="row justify-end q-mt-md">
        <q-btn
          flat
          no-caps
          label="Close"
          data-testid="archive-close"
          @click="emit('update:modelValue', false)"
        />
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { Todo } from "@/apps/context-switch/types";

defineProps<{ modelValue: boolean; archived: Todo[] }>();

const emit = defineEmits<{
  "update:modelValue": [open: boolean];
  delete: [todoId: string];
}>();

// Only one row shows its delete confirmation at a time.
const confirmingId = ref<string | null>(null);

function confirmDelete(todoId: string): void {
  emit("delete", todoId);
  confirmingId.value = null;
}

// Render raw ISO timestamps as a readable local date-time; fall back to the
// raw string if it isn't parseable so nothing silently disappears.
function formatAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}
</script>

<style scoped lang="sass">
.cs-archive
  display: flex
  flex-direction: column
  gap: 10px
  background: #242424
  color: #F0F0F0
  border-radius: 14px
  padding: 20px
  min-width: 360px
  max-height: 80vh
  overflow-y: auto

.cs-archive-title
  font-size: 16px
  font-weight: 600

.cs-archive-empty
  font-size: 13px
  color: #8A8A8A

.cs-archive-item
  display: flex
  align-items: flex-start
  justify-content: space-between
  gap: 12px
  border-left: 4px solid transparent
  border-radius: 8px
  background: #1E1E1E
  padding: 10px 12px

.cs-archive-header
  font-size: 15px
  font-weight: 600

.cs-archive-text
  font-size: 13px
  white-space: pre-wrap
  color: #C8C8C8

.cs-archive-at
  font-size: 12px
  color: #8A8A8A
  margin-top: 4px

.cs-archive-actions
  display: flex
  align-items: center
  gap: 4px
  white-space: nowrap

.cs-archive-confirm
  font-size: 12px
  color: #8A8A8A
</style>
