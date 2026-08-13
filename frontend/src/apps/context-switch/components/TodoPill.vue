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
    <div v-if="todo.body" class="cs-pill-body" data-testid="pill-body">
      {{ todo.body }}
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

.cs-pill-body
  font-size: 14px
  line-height: 1.35
  white-space: pre-wrap
  overflow: hidden
</style>
