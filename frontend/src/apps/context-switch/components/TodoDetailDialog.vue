<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="cs-dialog" data-testid="todo-detail-dialog">
      <div class="cs-dialog-title">Todo</div>

      <q-input
        v-model="header"
        dense
        outlined
        label="Header"
        data-testid="detail-header-input"
      />
      <q-input
        v-model="body"
        dense
        outlined
        type="textarea"
        label="Details"
        data-testid="detail-body-input"
      />

      <ColorPicker v-model="color" />

      <!-- Append-only progress log (Story 2.5): existing entries are read-only;
           the input below appends a new dated entry without touching header/body. -->
      <div class="cs-updates" data-testid="detail-updates">
        <div class="cs-updates-title">Updates</div>
        <div
          v-if="todo.updates.length === 0"
          class="cs-updates-empty"
          data-testid="detail-updates-empty"
        >
          No updates yet.
        </div>
        <div
          v-for="update in todo.updates"
          v-else
          :key="update.id"
          class="cs-update"
          :data-testid="`detail-update-${update.id}`"
        >
          <span class="cs-update-at">{{ formatAt(update.created_at) }}</span>
          <span class="cs-update-text">{{ update.text }}</span>
        </div>

        <div class="cs-update-add row items-end q-gutter-sm q-mt-sm">
          <q-input
            v-model="updateText"
            class="col"
            dense
            outlined
            label="Add an update"
            data-testid="detail-update-input"
            @keyup.enter="onAddUpdate"
          />
          <q-btn
            unelevated
            no-caps
            color="primary"
            label="Add"
            :disable="!canAddUpdate"
            data-testid="detail-update-add"
            @click="onAddUpdate"
          />
        </div>
      </div>

      <div class="row items-center justify-between q-mt-md">
        <q-btn
          flat
          no-caps
          color="positive"
          icon="check_circle"
          label="Close as done"
          data-testid="detail-close-done"
          @click="onCloseAsDone"
        />
        <div class="q-gutter-sm">
          <q-btn
            flat
            no-caps
            label="Cancel"
            data-testid="detail-cancel"
            @click="close"
          />
          <q-btn
            unelevated
            no-caps
            color="primary"
            label="Save"
            :disable="!canSave"
            data-testid="detail-save"
            @click="onSave"
          />
        </div>
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import ColorPicker from "@/apps/context-switch/components/ColorPicker.vue";
import type { Todo, TodoPatch } from "@/apps/context-switch/types";

const props = defineProps<{ modelValue: boolean; todo: Todo }>();

const emit = defineEmits<{
  "update:modelValue": [open: boolean];
  save: [patch: TodoPatch];
  "add-update": [text: string];
  "close-as-done": [];
}>();

const header = ref("");
const body = ref("");
const color = ref("");
const updateText = ref("");

const canAddUpdate = computed(() => updateText.value.trim().length > 0);

function onAddUpdate(): void {
  const text = updateText.value.trim();
  if (!text) return;
  emit("add-update", text);
  updateText.value = "";
}

// Render raw ISO timestamps as a readable local date-time; fall back to the
// raw string if it isn't parseable so nothing silently disappears.
function formatAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function seedFromTodo(): void {
  header.value = props.todo.header;
  body.value = props.todo.body;
  color.value = props.todo.color;
  updateText.value = "";
}

// Reopening (or opening a different pill) always shows that todo's own values.
watch(
  () => [props.modelValue, props.todo.id],
  ([open]) => {
    if (open) seedFromTodo();
  },
  { immediate: true },
);

const patch = computed<TodoPatch>(() => {
  const next: TodoPatch = {};
  if (header.value.trim() !== props.todo.header) {
    next.header = header.value.trim();
  }
  if (body.value !== props.todo.body) next.body = body.value;
  if (color.value !== props.todo.color) next.color = color.value;
  return next;
});

const canSave = computed(
  () => header.value.trim().length > 0 && Object.keys(patch.value).length > 0,
);

function close(): void {
  emit("update:modelValue", false);
}

function onSave(): void {
  if (!canSave.value) return;
  emit("save", patch.value);
  close();
}

// Closing as done archives the todo (Story 2.6); the board removes the pill.
// No confirm — archiving is soft and recoverable via the archive view (2.7).
function onCloseAsDone(): void {
  emit("close-as-done");
  close();
}
</script>

<style scoped lang="sass">
.cs-dialog
  display: flex
  flex-direction: column
  gap: 12px
  background: #fff
  border-radius: 14px
  padding: 20px
  min-width: 340px

.cs-dialog-title
  font-size: 16px
  font-weight: 600

.cs-updates
  border-top: 1px solid rgba(0, 0, 0, 0.12)
  padding-top: 10px

.cs-updates-title
  font-size: 13px
  font-weight: 600
  margin-bottom: 6px

.cs-updates-empty
  font-size: 13px
  color: #5f6368

.cs-update
  display: flex
  gap: 8px
  font-size: 13px
  padding: 2px 0

.cs-update-at
  color: #5f6368
  white-space: nowrap
</style>
