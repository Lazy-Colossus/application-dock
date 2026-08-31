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

          <q-option-group
            v-if="canCopy"
            v-model="mode"
            inline
            dense
            :options="MODE_OPTIONS"
            data-testid="column-mode"
          />

          <!-- Each branch keeps a single root element: swapping two
               multi-root <template> branches trips Vue's fragment anchors. -->
          <div v-if="mode === 'copy'">
            <q-select
              v-model="copySourceId"
              dense
              outlined
              emit-value
              map-options
              class="q-mt-sm"
              label="Same columns as…"
              :options="sourceOptions"
              data-testid="copy-source"
            />
            <div
              v-if="previewColumns.length"
              class="text-caption text-grey-6 q-mt-xs"
              data-testid="copy-preview"
            >
              Copies
              {{
                previewColumns.map((c) => `${c.name} (${c.type})`).join(", ")
              }}
              — and no rows.
            </div>
          </div>

          <div v-else>
            <ColumnBuilder v-model="columns" :allow-place="allowPlace" />
            <div
              v-if="duplicateNames"
              class="text-negative text-caption q-mt-xs"
            >
              Column names must be unique.
            </div>
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

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    existingTabs: Tab[];
    allowPlace?: boolean;
  }>(),
  { allowPlace: false },
);
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  submit: [
    payload: {
      name: string;
      columns?: ColumnSpec[];
      copyColumnsFrom?: string;
    },
  ];
}>();

type Mode = "define" | "copy";

const MODE_OPTIONS: { label: string; value: Mode }[] = [
  { label: "Define columns", value: "define" },
  { label: "Same columns as…", value: "copy" },
];

function blankColumns(): ColumnSpec[] {
  return [{ name: "", type: "text" }];
}

const name = ref("");
const columns = ref<ColumnSpec[]>(blankColumns());
const mode = ref<Mode>("define");
const copySourceId = ref<string | null>(null);

// Copying only makes sense when there is something to copy from.
const canCopy = computed(() => props.existingTabs.length > 0);

const sourceOptions = computed(() =>
  [...props.existingTabs]
    .sort((a, b) => a.order - b.order)
    .map((tab) => ({ label: tab.name, value: tab.id })),
);

const previewColumns = computed(() => {
  const source = props.existingTabs.find((t) => t.id === copySourceId.value);
  return source ? [...source.columns].sort((a, b) => a.order - b.order) : [];
});

copySourceId.value = props.existingTabs[0]?.id ?? null;

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      name.value = "";
      columns.value = blankColumns();
      mode.value = "define";
      copySourceId.value = props.existingTabs[0]?.id ?? null;
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

const canSubmit = computed(() => {
  if (!name.value.trim()) return false;
  if (mode.value === "copy") return copySourceId.value !== null;
  return (
    trimmed.value.length > 0 &&
    trimmed.value.every((c) => c.name.length > 0) &&
    !duplicateNames.value
  );
});

function submit(): void {
  if (!canSubmit.value) return;
  // Exactly one of the two — the API rejects both or neither.
  if (mode.value === "copy" && copySourceId.value) {
    emit("submit", {
      name: name.value.trim(),
      copyColumnsFrom: copySourceId.value,
    });
    return;
  }
  emit("submit", { name: name.value.trim(), columns: trimmed.value });
}
</script>
