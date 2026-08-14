<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="cs-dialog" data-testid="add-todo-dialog">
      <div class="cs-dialog-title">New todo</div>

      <q-input
        v-model="header"
        dense
        outlined
        autofocus
        label="Header"
        data-testid="todo-header-input"
        @keyup.enter="onSubmit"
      />
      <q-input
        v-model="update"
        dense
        outlined
        type="textarea"
        label="First update (optional)"
        data-testid="todo-update-input"
      />

      <ColorPicker v-model="color" />

      <div class="row justify-end q-gutter-sm q-mt-md">
        <q-btn
          flat
          no-caps
          label="Cancel"
          data-testid="todo-cancel"
          @click="close"
        />
        <q-btn
          unelevated
          no-caps
          color="primary"
          label="Add"
          :disable="!canSubmit"
          data-testid="todo-submit"
          @click="onSubmit"
        />
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import ColorPicker from "@/apps/context-switch/components/ColorPicker.vue";
import { DEFAULT_COLOR } from "@/apps/context-switch/colors";
import type { NewTodo } from "@/apps/context-switch/types";

const props = defineProps<{ modelValue: boolean }>();

const emit = defineEmits<{
  "update:modelValue": [open: boolean];
  create: [todo: NewTodo];
}>();

const header = ref("");
const update = ref("");
const color = ref<string>(DEFAULT_COLOR);

const canSubmit = computed(() => header.value.trim().length > 0);

// Reopening the dialog always starts from a clean form.
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      header.value = "";
      update.value = "";
      color.value = DEFAULT_COLOR;
    }
  },
);

function close(): void {
  emit("update:modelValue", false);
}

function onSubmit(): void {
  if (!canSubmit.value) return;
  const seed = update.value.trim();
  emit("create", {
    header: header.value.trim(),
    color: color.value,
    ...(seed ? { update: seed } : {}),
  });
  close();
}
</script>

<style scoped lang="sass">
.cs-dialog
  display: flex
  flex-direction: column
  gap: 12px
  background: #242424
  color: #F0F0F0
  border-radius: 14px
  padding: 20px
  min-width: 320px

.cs-dialog-title
  font-size: 16px
  font-weight: 600
</style>
