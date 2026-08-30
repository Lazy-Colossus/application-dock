<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <q-card class="create-tab-dialog">
      <q-card-section class="text-h6">New tab</q-card-section>

      <q-card-section class="column q-gutter-md">
        <q-input
          v-model="name"
          dense
          outlined
          autofocus
          label="Tab name"
          data-testid="tab-name"
        />
        <div
          v-if="nameAlreadyUsed"
          class="text-caption text-grey-6"
          data-testid="duplicate-tab-hint"
        >
          This sheet already has a tab called “{{ name.trim() }}”. That is
          allowed — tabs are told apart by more than their name.
        </div>

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
          data-testid="create-tab-cancel"
          @click="emit('update:modelValue', false)"
        />
        <q-btn
          unelevated
          no-caps
          color="primary"
          label="Create"
          :disable="!canSubmit"
          data-testid="create-tab-submit"
          @click="submit"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import ColumnBuilder from "./ColumnBuilder.vue";
import type { ColumnSpec, Tab } from "@/apps/listies/types";

const props = defineProps<{ modelValue: boolean; existingTabs: Tab[] }>();
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

// A hint, not a block: tab names need not be unique.
const nameAlreadyUsed = computed(() =>
  props.existingTabs.some(
    (tab) => tab.name.toLowerCase() === name.value.trim().toLowerCase(),
  ),
);

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
