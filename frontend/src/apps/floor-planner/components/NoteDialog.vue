<template>
  <div class="floor-planner-panel note-dialog__card" data-testid="note-dialog">
    <!-- A div root: Quasar only gives a dialog's direct div children pointer events. -->
    <form class="note-dialog" @submit.prevent="save">
      <h2 class="note-dialog__title">{{ isNew ? "New note" : "Note" }}</h2>
      <label class="note-dialog__field">
        Text
        <input
          ref="input"
          v-model="text"
          :maxlength="PLAN_NOTE_MAX"
          placeholder="e.g. Radiator under the window"
          data-testid="note-text"
        />
      </label>
      <div class="note-dialog__field">
        Direction
        <div class="note-dialog__seg" role="group" aria-label="Direction">
          <button
            type="button"
            :aria-pressed="!vertical"
            data-testid="note-horizontal"
            @click="vertical = false"
          >
            Horizontal
          </button>
          <button
            type="button"
            :aria-pressed="vertical"
            data-testid="note-vertical"
            @click="vertical = true"
          >
            Vertical
          </button>
        </div>
      </div>
      <div class="note-dialog__actions">
        <button
          v-if="!isNew"
          type="button"
          class="fp-button note-dialog__delete"
          data-testid="note-remove"
          @click="emit('remove')"
        >
          Delete
        </button>
        <span class="note-dialog__spacer" />
        <button type="button" class="fp-button" @click="emit('cancel')">
          Cancel
        </button>
        <button
          type="submit"
          class="fp-button fp-button--primary"
          :disabled="text.trim() === ''"
          data-testid="note-save"
        >
          Save
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import "../css/floor-planner.sass";

/** Mirrors PLAN_NOTE_MAX in backend/app/schemas/floor_planner.py. */
const PLAN_NOTE_MAX = 80;

const props = defineProps<{
  initial: { text: string; vertical: boolean };
  isNew: boolean;
}>();

const emit = defineEmits<{
  save: [text: string, vertical: boolean];
  remove: [];
  cancel: [];
}>();

const text = ref(props.initial.text);
const vertical = ref(props.initial.vertical);
const input = ref<HTMLInputElement | null>(null);

onMounted(() => input.value?.focus());

function save(): void {
  const trimmed = text.value.trim();
  if (trimmed) emit("save", trimmed, vertical.value);
}
</script>

<style scoped lang="scss">
.note-dialog__card {
  border-radius: 8px;
}
.note-dialog {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 320px;
  padding: 20px;
  border-radius: 8px;
}
.note-dialog__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.note-dialog__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--fp-muted);
}
.note-dialog__field input {
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--fp-control-line);
  border-radius: 6px;
  background: var(--fp-chrome);
  color: var(--fp-ink);
  font: 400 14px var(--fp-sans);
}
.note-dialog__seg {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 8px;
  background: #f1efea;
}
.note-dialog__seg button {
  flex: 1;
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #3d3b36;
  font: 500 12px/1 var(--fp-sans);
  cursor: pointer;
}
.note-dialog__seg button[aria-pressed="true"] {
  background: var(--fp-chrome);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  color: var(--fp-ink);
  font-weight: 600;
}
.note-dialog__actions {
  display: flex;
  gap: 8px;
}
.note-dialog__spacer {
  flex: 1;
}
.note-dialog__delete {
  color: var(--fp-warn-ink);
}
</style>
