<template>
  <form
    class="label-dialog floor-planner-panel"
    data-testid="label-dialog"
    @submit.prevent="save"
  >
    <h2 class="label-dialog__title">
      {{ editing ? "Room label" : "New room label" }}
    </h2>
    <label class="label-dialog__field">
      Name
      <input
        ref="input"
        v-model="text"
        maxlength="40"
        placeholder="e.g. Living room"
        data-testid="label-text"
      />
    </label>
    <div class="label-dialog__actions">
      <button
        v-if="editing"
        type="button"
        class="fp-button label-dialog__delete"
        data-testid="label-remove"
        @click="emit('remove')"
      >
        Delete
      </button>
      <span class="label-dialog__spacer" />
      <button type="button" class="fp-button" @click="emit('cancel')">
        Cancel
      </button>
      <button
        type="submit"
        class="fp-button fp-button--primary"
        :disabled="text.trim() === ''"
        data-testid="label-save"
      >
        Save
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import "../css/floor-planner.sass";

const props = defineProps<{ initial: string; editing: boolean }>();

const emit = defineEmits<{
  save: [text: string];
  remove: [];
  cancel: [];
}>();

const text = ref(props.initial);
const input = ref<HTMLInputElement | null>(null);

onMounted(() => input.value?.focus());

function save(): void {
  const trimmed = text.value.trim();
  if (trimmed) emit("save", trimmed);
}
</script>

<style scoped lang="scss">
.label-dialog {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 320px;
  padding: 20px;
  border-radius: 8px;
}
.label-dialog__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.label-dialog__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--fp-muted);
}
.label-dialog__field input {
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--fp-control-line);
  border-radius: 6px;
  background: var(--fp-chrome);
  color: var(--fp-ink);
  font: 400 14px var(--fp-sans);
}
.label-dialog__actions {
  display: flex;
  gap: 8px;
}
.label-dialog__spacer {
  flex: 1;
}
.label-dialog__delete {
  color: var(--fp-warn-ink);
}
</style>
