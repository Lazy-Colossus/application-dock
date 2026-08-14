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

      <div v-else class="cs-archive-list">
        <div
          v-for="todo in archived"
          :key="todo.id"
          class="cs-archive-item"
          :style="{ borderLeftColor: todo.color }"
          :data-testid="`archived-item-${todo.id}`"
        >
          <div class="cs-archive-body">
            <div class="cs-archive-header">{{ todo.header }}</div>
            <div v-if="latestText(todo)" class="cs-archive-text">
              {{ latestText(todo) }}
            </div>
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

// The archived todo's most recent update stands in for the old body preview
// (Story 2.8 removed body); empty string when the log is empty.
function latestText(todo: Todo): string {
  return todo.updates.at(-1)?.text ?? "";
}

// Render raw ISO timestamps as a readable local date-time; fall back to the
// raw string if it isn't parseable so nothing silently disappears.
function formatAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}
</script>

<style scoped lang="sass">
// The card itself never scrolls, so its rounded corners stay clean; only the
// inner list scrolls. overflow: hidden clips the list's corners to the radius.
.cs-archive
  display: flex
  flex-direction: column
  gap: 10px
  background: #242424
  color: #F0F0F0
  border-radius: 14px
  padding: 20px
  width: 420px
  max-width: 90vw
  max-height: 80vh
  overflow: hidden

.cs-archive-title
  font-size: 16px
  font-weight: 600

.cs-archive-empty
  font-size: 13px
  color: #8A8A8A

// Scrollable region between the fixed title and Close button. A thin, themed
// scrollbar sits inset from the edges so it never clips the card corner.
.cs-archive-list
  display: flex
  flex-direction: column
  gap: 10px
  flex: 1 1 auto
  overflow-y: auto
  padding-right: 6px
  scrollbar-width: thin
  scrollbar-color: #4A4A4A transparent

  &::-webkit-scrollbar
    width: 8px

  &::-webkit-scrollbar-thumb
    background: #4A4A4A
    border-radius: 4px

  &::-webkit-scrollbar-track
    background: transparent

.cs-archive-item
  display: flex
  align-items: flex-start
  justify-content: space-between
  gap: 12px
  border-left: 4px solid transparent
  border-radius: 8px
  background: #1E1E1E
  padding: 10px 12px

// min-width: 0 lets the text column shrink below its content width so the
// header/body can be truncated with an ellipsis instead of forcing overflow.
.cs-archive-body
  min-width: 0

// One line, then an ellipsis.
.cs-archive-header
  font-size: 15px
  font-weight: 600
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis

// Clamp to two lines, then an ellipsis (long unbroken strings break first).
.cs-archive-text
  font-size: 13px
  color: #C8C8C8
  overflow: hidden
  overflow-wrap: anywhere
  display: -webkit-box
  -webkit-line-clamp: 2
  -webkit-box-orient: vertical

.cs-archive-at
  font-size: 12px
  color: #8A8A8A
  margin-top: 4px

// Keep the delete control at its natural size no matter how long the text is.
.cs-archive-actions
  flex-shrink: 0
  display: flex
  align-items: center
  gap: 4px
  white-space: nowrap

.cs-archive-confirm
  font-size: 12px
  color: #8A8A8A
</style>
