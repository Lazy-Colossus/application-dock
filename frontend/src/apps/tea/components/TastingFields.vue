<template>
  <div class="tasting">
    <details
      v-for="section in TASTING_SECTIONS"
      :key="section.key"
      class="tasting__section"
      :open="openAtStart[section.key]"
      :data-testid="`tasting-section-${section.key}`"
    >
      <summary class="tasting__head">
        {{ section.title }}<span v-if="section.zh" class="tasting__zh">{{ section.zh }}</span>
        <span
          v-if="counts[section.key]"
          class="tasting__count"
          :data-testid="`tasting-count-${section.key}`"
          >· {{ counts[section.key] }} noted</span
        >
      </summary>

      <div v-for="field in section.fields" :key="field.path" class="tasting__field">
        <span class="tasting__label">
          {{ field.label }}<span v-if="field.zh" class="tasting__zh">{{ field.zh }}</span>
          <small v-if="field.hint" class="tasting__hint">{{ field.hint }}</small>
        </span>

        <input
          v-if="field.kind === 'text'"
          class="tasting__input"
          :data-testid="`tasting-${field.path}`"
          :value="getAt(current, field.path) ?? ''"
          @input="set(field.path, ($event.target as HTMLInputElement).value)"
        />
        <StarRating
          v-else-if="field.kind === 'stars'"
          :model-value="getAt(current, field.path) as number | null"
          :label="field.label"
          :testid="`tasting-${field.path}`"
          @update:model-value="set(field.path, $event)"
        />
        <div v-else class="tasting__chips" role="group" :aria-label="field.label">
          <button
            v-for="option in field.options"
            :key="option.value"
            type="button"
            :class="['tasting__chip', { 'tasting__chip--on': isOn(field, option.value) }]"
            :aria-pressed="isOn(field, option.value) ? 'true' : 'false'"
            :data-testid="`tasting-${field.path}-${option.value}`"
            @click="pick(field, option)"
          >
            {{ option.label }}<span v-if="option.zh" class="tasting__zh">{{ option.zh }}</span>
          </button>
        </div>
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import StarRating from "./StarRating.vue";
import {
  TASTING_SECTIONS,
  emptyTasting,
  filledCount,
  getAt,
  isEmptyTasting,
  setAt,
  type TastingField,
  type TastingOption,
  type TastingValue,
} from "../tasting";
import type { Tasting } from "../types";

const props = defineProps<{ modelValue: Tasting | null }>();
const emit = defineEmits<{ "update:modelValue": [value: Tasting | null] }>();

const current = computed(() => props.modelValue ?? emptyTasting());
// Decided once: a section you're filling in must not snap shut or open as values change.
const openAtStart = Object.fromEntries(
  TASTING_SECTIONS.map((s) => [s.key, filledCount(current.value, s) > 0]),
);
const counts = computed(() =>
  Object.fromEntries(TASTING_SECTIONS.map((s) => [s.key, filledCount(current.value, s)])),
);

function set(path: string, value: TastingValue): void {
  const next = setAt(current.value, path, value);
  // An all-empty sheet is no tasting at all, so it never counts as "tasted".
  emit("update:modelValue", isEmptyTasting(next) ? null : next);
}

function isOn(field: TastingField, value: string): boolean {
  const held = getAt(current.value, field.path);
  return Array.isArray(held) ? held.includes(value) : held === value;
}

function pick(field: TastingField, option: TastingOption): void {
  const held = getAt(current.value, field.path);
  if (field.kind === "scale") {
    set(field.path, held === option.value ? null : option.value);
    return;
  }
  const list = (held as string[]) ?? [];
  const exclusive = new Set(field.options?.filter((o) => o.exclusive).map((o) => o.value));
  let next: string[];
  if (list.includes(option.value)) next = list.filter((v) => v !== option.value);
  else if (option.exclusive) next = [option.value];
  else next = [...list.filter((v) => !exclusive.has(v)), option.value];
  const order = (field.options ?? []).map((o) => o.value);
  set(
    field.path,
    order.filter((v) => next.includes(v)),
  );
}
</script>

<style scoped lang="scss">
.tasting {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 22px;
}
.tasting__section {
  background: #1e1712;
  border-radius: 6px;
  padding: 0 14px;
}
.tasting__head {
  color: #efe7da;
  font-size: 15px;
  padding: 14px 0;
  cursor: pointer;
}
.tasting__count {
  color: #8b7a63;
  font-size: 13px;
  margin-left: 6px;
}
.tasting__zh {
  color: #a99781;
  font-size: 12px;
  margin-left: 6px;
}
.tasting__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 0 14px;
}
.tasting__label {
  color: #8b7a63;
  font-size: 13px;
}
.tasting__hint {
  color: #6b5f52;
  margin-left: 6px;
}
.tasting__input {
  background: #17120e;
  border: 1px solid #2c241d;
  border-radius: 6px;
  color: #efe7da;
  font-family: inherit;
  font-size: 16px;
  padding: 9px 12px;
}
.tasting__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tasting__chip {
  background: transparent;
  border: 1px solid #2c241d;
  border-radius: 999px;
  color: #8b7a63;
  font-family: inherit;
  font-size: 14px;
  padding: 5px 11px;
  cursor: pointer;
}
.tasting__chip--on {
  background: #2c241d;
  border-color: #6b5f52;
  color: #efe7da;
}
</style>
