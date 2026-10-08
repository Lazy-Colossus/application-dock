<template>
  <div class="floor-planner-panel name-dialog__card" data-testid="name-dialog">
    <!-- A div root: Quasar only gives a dialog's direct div children pointer events. -->
    <form class="name-dialog" @submit.prevent="save">
      <h2 class="name-dialog__title">{{ title }}</h2>
      <label class="name-dialog__field">
        Name
        <input
          ref="input"
          v-model="text"
          maxlength="40"
          :placeholder="placeholder"
          data-testid="name-text"
        />
      </label>
      <div class="name-dialog__actions">
        <button
          v-if="canDelete"
          type="button"
          class="fp-button name-dialog__delete"
          data-testid="name-remove"
          @click="emit('remove')"
        >
          Delete
        </button>
        <span class="name-dialog__spacer" />
        <button type="button" class="fp-button" @click="emit('cancel')">
          Cancel
        </button>
        <button
          type="submit"
          class="fp-button fp-button--primary"
          :disabled="text.trim() === ''"
          data-testid="name-save"
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

const props = defineProps<{
  title: string;
  initial: string;
  placeholder: string;
  canDelete: boolean;
}>();

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
.name-dialog__card {
  border-radius: 8px;
}
.name-dialog {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 320px;
  padding: 20px;
  border-radius: 8px;
}
.name-dialog__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.name-dialog__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--fp-muted);
}
.name-dialog__field input {
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--fp-control-line);
  border-radius: 6px;
  background: var(--fp-chrome);
  color: var(--fp-ink);
  font: 400 14px var(--fp-sans);
}
.name-dialog__actions {
  display: flex;
  gap: 8px;
}
.name-dialog__spacer {
  flex: 1;
}
.name-dialog__delete {
  color: var(--fp-warn-ink);
}
</style>
