<template>
  <div class="row" :class="{ 'row--ready': affordable }">
    <span class="row__code">{{ project.code }}</span>
    <span v-if="project.name" class="row__name">{{ project.name }}</span>
    <span
      v-if="prerequisite"
      class="chip"
      :class="{ 'chip--done': prerequisite.done }"
      :data-testid="`project-prereq-${project.id}`"
    >
      needs {{ prerequisite.code }}
    </span>
    <span class="row__actions">
      <button
        type="button"
        :data-testid="`project-edit-${project.id}`"
        @click="emit('edit')"
      >
        Edit
      </button>
      <button
        v-if="project.done"
        type="button"
        :data-testid="`project-reopen-${project.id}`"
        @click="emit('reopen')"
      >
        Reopen
      </button>
      <button
        v-else
        type="button"
        :data-testid="`project-complete-${project.id}`"
        @click="emit('complete')"
      >
        Complete
      </button>
      <button
        type="button"
        :data-testid="`project-delete-${project.id}`"
        @click="emit('remove')"
      >
        Delete
      </button>
    </span>
  </div>
</template>

<script setup lang="ts">
import type { Project } from "../types";

defineProps<{
  project: Project;
  prerequisite: Project | undefined;
  affordable: boolean;
}>();
const emit = defineEmits<{ edit: []; complete: []; reopen: []; remove: [] }>();
</script>

<style scoped lang="scss">
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(127, 127, 127, 0.2);
}
.row--ready {
  background: rgba(63, 166, 107, 0.14);
  box-shadow: inset 3px 0 0 #3fa66b;
  padding-left: 10px;
  padding-right: 6px;
  border-radius: 4px;
}
.row__code {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.row__actions {
  margin-left: auto;
  display: flex;
  gap: 6px;
}
.row__actions button {
  background: transparent;
  border: 0;
  font-size: 13px;
  cursor: pointer;
  color: inherit;
  opacity: 0.8;
}
.chip {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(127, 127, 127, 0.18);
}
.chip--done {
  opacity: 0.45;
}
</style>
