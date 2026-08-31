<template>
  <div class="column-builder column q-gutter-sm">
    <div
      v-for="(spec, index) in modelValue"
      :key="index"
      class="row items-center q-gutter-sm no-wrap"
    >
      <q-input
        dense
        outlined
        class="col"
        placeholder="Column name"
        :model-value="spec.name"
        :data-testid="`column-name-${index}`"
        @update:model-value="setName(index, String($event ?? ''))"
      />
      <q-select
        dense
        outlined
        emit-value
        map-options
        class="column-builder__type"
        :model-value="spec.type"
        :options="typeOptions"
        :data-testid="`column-type-${index}`"
        @update:model-value="setType(index, $event)"
      />
      <q-btn
        dense
        flat
        round
        icon="arrow_upward"
        :disable="index === 0"
        :data-testid="`move-up-${index}`"
        @click="move(index, -1)"
      />
      <q-btn
        dense
        flat
        round
        icon="arrow_downward"
        :disable="index === modelValue.length - 1"
        :data-testid="`move-down-${index}`"
        @click="move(index, 1)"
      />
      <q-btn
        v-if="modelValue.length > 1"
        dense
        flat
        round
        icon="close"
        :data-testid="`remove-column-${index}`"
        @click="remove(index)"
      />
    </div>

    <div>
      <q-btn
        dense
        flat
        no-caps
        icon="add"
        label="Add column"
        data-testid="add-column"
        @click="add"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { columnTypeOptions } from "@/apps/listies/columnTypes";
import type { ColumnSpec, ColumnType } from "@/apps/listies/types";

const props = withDefaults(
  defineProps<{ modelValue: ColumnSpec[]; allowPlace?: boolean }>(),
  { allowPlace: false },
);
const emit = defineEmits<{ "update:modelValue": [value: ColumnSpec[]] }>();

const typeOptions = computed(() => columnTypeOptions(props.allowPlace));

function replace(index: number, spec: ColumnSpec): void {
  emit(
    "update:modelValue",
    props.modelValue.map((existing, i) => (i === index ? spec : existing)),
  );
}

function setName(index: number, name: string): void {
  replace(index, { ...props.modelValue[index]!, name });
}

function setType(index: number, type: ColumnType): void {
  replace(index, { ...props.modelValue[index]!, type });
}

function add(): void {
  emit("update:modelValue", [...props.modelValue, { name: "", type: "text" }]);
}

function remove(index: number): void {
  emit(
    "update:modelValue",
    props.modelValue.filter((_, i) => i !== index),
  );
}

function move(index: number, delta: number): void {
  const target = index + delta;
  if (target < 0 || target >= props.modelValue.length) return;
  const next = [...props.modelValue];
  [next[index], next[target]] = [next[target]!, next[index]!];
  emit("update:modelValue", next);
}
</script>

<style scoped>
.column-builder__type {
  min-width: 8rem;
}
</style>
