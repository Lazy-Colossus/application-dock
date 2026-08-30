<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <q-card class="create-sheet-dialog">
      <q-card-section class="text-h6">New sheet</q-card-section>

      <q-card-section class="column q-gutter-md">
        <q-input
          v-model="name"
          dense
          outlined
          autofocus
          label="Sheet name"
          data-testid="sheet-name"
        />

        <div>
          <div class="text-caption text-grey-6 q-mb-xs">Columns</div>
          <ColumnBuilder v-model="columns" />
          <div v-if="duplicateNames" class="text-negative text-caption q-mt-xs">
            Column names must be unique.
          </div>
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn
          flat
          no-caps
          label="Cancel"
          data-testid="create-sheet-cancel"
          @click="emit('update:modelValue', false)"
        />
        <q-btn
          unelevated
          no-caps
          color="primary"
          label="Create"
          :disable="!canSubmit"
          data-testid="create-sheet-submit"
          @click="submit"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import ColumnBuilder from "./ColumnBuilder.vue";
import type { ColumnSpec } from "@/apps/listies/types";

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  submit: [payload: { name: string; columns: ColumnSpec[] }];
}>();

function blankColumns(): ColumnSpec[] {
  return [{ name: "", type: "text" }];
}

const name = ref("");
const columns = ref<ColumnSpec[]>(blankColumns());

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      name.value = "";
      columns.value = blankColumns();
    }
  },
);

const trimmed = computed(() =>
  columns.value.map((c) => ({ ...c, name: c.name.trim() })),
);

const duplicateNames = computed(() => {
  const names = trimmed.value.map((c) => c.name.toLowerCase()).filter(Boolean);
  return new Set(names).size !== names.length;
});

const canSubmit = computed(
  () =>
    name.value.trim().length > 0 &&
    trimmed.value.length > 0 &&
    trimmed.value.every((c) => c.name.length > 0) &&
    !duplicateNames.value,
);

function submit(): void {
  if (!canSubmit.value) return;
  emit("submit", { name: name.value.trim(), columns: trimmed.value });
}
</script>
