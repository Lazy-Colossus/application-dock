<template>
  <div class="tabs" data-testid="layout-tabs">
    <div class="tabs__list" role="tablist" aria-label="Layouts">
      <button
        v-for="l in layouts"
        :key="l.id"
        type="button"
        role="tab"
        class="tabs__tab"
        :class="{ 'tabs__tab--on': l.id === activeId }"
        :aria-selected="l.id === activeId"
        :data-testid="`layout-${l.id}`"
        @click="emit('select', l.id)"
      >
        {{ l.name }}
      </button>
    </div>
    <button
      type="button"
      class="tabs__action"
      data-testid="layout-create"
      @click="emit('create')"
    >
      + New layout
    </button>
    <button
      type="button"
      class="tabs__action"
      data-testid="layout-duplicate"
      @click="emit('duplicate')"
    >
      Duplicate
    </button>
    <button
      type="button"
      class="tabs__action"
      data-testid="layout-rename"
      @click="emit('rename')"
    >
      Rename
    </button>
    <button
      type="button"
      class="tabs__action"
      :disabled="layouts.length <= 1"
      data-testid="layout-delete"
      @click="emit('remove')"
    >
      Delete
    </button>
  </div>
</template>

<script setup lang="ts">
import type { Layout } from "../types";

defineProps<{ layouts: Layout[]; activeId: string | null }>();

const emit = defineEmits<{
  select: [id: string];
  create: [];
  duplicate: [];
  rename: [];
  remove: [];
}>();
</script>

<style scoped lang="scss">
.tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  align-self: stretch;
  margin: -4px 0;
}
.tabs__list {
  display: flex;
}
.tabs__tab {
  min-height: 44px;
  padding: 0 16px;
  border: 0;
  border-top: 3px solid transparent;
  background: transparent;
  color: #3d3b36;
  font: 500 13px/1 var(--fp-sans);
  cursor: pointer;
}
.tabs__tab--on {
  border-top-color: var(--fp-accent);
  background: #eef2fd;
  color: var(--fp-ink);
  font-weight: 600;
}
.tabs__action {
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  background: transparent;
  color: var(--fp-accent);
  font: 500 13px/1 var(--fp-sans);
  cursor: pointer;
  &:disabled {
    color: var(--fp-muted);
    cursor: default;
  }
}
</style>
