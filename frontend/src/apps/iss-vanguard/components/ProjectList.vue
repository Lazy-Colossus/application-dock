<template>
  <div class="projects">
    <p v-if="projects.length === 0" class="projects__empty">No projects yet.</p>
    <ul class="projects__list">
      <li
        v-for="project in open"
        :key="project.id"
        :data-testid="`project-${project.id}`"
      >
        <ProjectRow
          :project="project"
          :prerequisite="prerequisiteOf(project)"
          @edit="emit('edit', project)"
          @complete="emit('complete', project)"
          @reopen="emit('reopen', project)"
          @remove="emit('remove', project)"
        />
      </li>
    </ul>
    <details v-if="done.length > 0" data-testid="completed">
      <summary>Completed ({{ done.length }})</summary>
      <ul class="projects__list">
        <li
          v-for="project in done"
          :key="project.id"
          :data-testid="`project-${project.id}`"
        >
          <ProjectRow
            :project="project"
            :prerequisite="prerequisiteOf(project)"
            @edit="emit('edit', project)"
            @complete="emit('complete', project)"
            @reopen="emit('reopen', project)"
            @remove="emit('remove', project)"
          />
        </li>
      </ul>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ProjectRow from "./ProjectRow.vue";
import type { Project } from "../types";

const props = defineProps<{ projects: Project[] }>();
const emit = defineEmits<{
  edit: [project: Project];
  complete: [project: Project];
  reopen: [project: Project];
  remove: [project: Project];
}>();

const open = computed(() => props.projects.filter((p) => !p.done));
const done = computed(() => props.projects.filter((p) => p.done));
const byId = computed(() => new Map(props.projects.map((p) => [p.id, p])));

function prerequisiteOf(project: Project): Project | undefined {
  return project.prerequisite_id
    ? byId.value.get(project.prerequisite_id)
    : undefined;
}
</script>

<style scoped lang="scss">
.projects__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.projects__empty {
  opacity: 0.6;
}
</style>
