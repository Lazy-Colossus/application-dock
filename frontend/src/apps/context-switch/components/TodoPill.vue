<template>
  <div
    class="cs-pill"
    role="button"
    tabindex="0"
    :style="{ background: todo.color, color: textColor }"
    :data-testid="`pill-${todo.id}`"
    @click="emit('open')"
    @keyup.enter="emit('open')"
  >
    <div class="cs-pill-header" data-testid="pill-header">
      {{ todo.header }}
    </div>
    <div
      v-if="latestUpdate"
      class="cs-pill-update"
      data-testid="pill-update-latest"
    >
      {{ latestUpdate.text }}
    </div>
    <div
      v-if="previousUpdate"
      class="cs-pill-update cs-pill-update--faded"
      data-testid="pill-update-previous"
    >
      {{ previousUpdate.text }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { readableTextColor } from "@/apps/context-switch/colors";
import type { Todo } from "@/apps/context-switch/types";

const props = defineProps<{ todo: Todo }>();

const emit = defineEmits<{ open: [] }>();

const textColor = computed(() => readableTextColor(props.todo.color));

// Updates are stored oldest→newest, so the pill surfaces the last two, newest
// on top (Story 2.8). `previousUpdate` is null unless there are at least two.
const latestUpdate = computed(() => props.todo.updates.at(-1) ?? null);
const previousUpdate = computed(() =>
  props.todo.updates.length >= 2 ? (props.todo.updates.at(-2) ?? null) : null,
);
</script>

<style scoped lang="sass">
.cs-pill
  display: flex
  flex-direction: column
  gap: 6px
  height: 100%
  min-height: 120px
  padding: 16px 18px
  border-radius: 22px
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2)
  overflow: hidden
  cursor: pointer

.cs-pill-header
  font-size: 18px
  font-weight: 600
  line-height: 1.25

.cs-pill-update
  font-size: 14px
  line-height: 1.35
  overflow: hidden
  overflow-wrap: anywhere
  display: -webkit-box
  -webkit-line-clamp: 2
  -webkit-box-orient: vertical

.cs-pill-update--faded
  opacity: 0.5
  -webkit-line-clamp: 1
</style>
