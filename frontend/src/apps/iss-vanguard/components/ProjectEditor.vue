<template>
  <div class="editor" data-testid="project-editor">
    <p class="editor__title">{{ project ? "Edit project" : "New project" }}</p>
    <label class="editor__label">
      Code
      <input
        v-model="code"
        class="editor__field"
        placeholder="e.g. VB07"
        data-testid="editor-code"
      />
    </label>
    <label class="editor__label">
      Name
      <input v-model="name" class="editor__field" data-testid="editor-name" />
    </label>
    <label class="editor__label">
      Requires
      <select
        v-model="prerequisite"
        class="editor__field"
        data-testid="editor-prerequisite"
      >
        <option value="">Nothing</option>
        <option v-for="other in candidates" :key="other.id" :value="other.id">
          {{ other.code }}{{ other.name ? ` · ${other.name}` : "" }}
        </option>
      </select>
    </label>

    <p class="editor__label">Cost</p>
    <ResourceGrid :grid="cost" mode="edit" @cell-tap="select" />
    <StockStepper
      v-if="selected"
      :resource="selected.resource"
      :tier="selected.tier"
      :count="cost[selected.resource][selected.tier]"
      :busy="false"
      @step="step"
      @close="selected = null"
    />

    <div class="editor__actions">
      <button type="button" data-testid="editor-cancel" @click="emit('cancel')">
        Cancel
      </button>
      <button
        type="button"
        data-testid="editor-save"
        :disabled="busy || code.trim() === ''"
        @click="save"
      >
        Save
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import ResourceGrid from "./ResourceGrid.vue";
import StockStepper from "./StockStepper.vue";
import { emptyGrid } from "../resources";
import type { Grid, Project, ProjectDraft, ResourceId, TierId } from "../types";

const props = defineProps<{
  project: Project | null;
  projects: Project[];
  busy: boolean;
}>();
const emit = defineEmits<{ save: [draft: ProjectDraft]; cancel: [] }>();

const code = ref(props.project?.code ?? "");
const name = ref(props.project?.name ?? "");
const prerequisite = ref(props.project?.prerequisite_id ?? "");
// A deep copy: the cost grid is edited locally and only leaves on Save.
const cost = ref<Grid>(
  props.project
    ? (JSON.parse(JSON.stringify(props.project.cost)) as Grid)
    : emptyGrid(),
);
const selected = ref<{ resource: ResourceId; tier: TierId } | null>(null);

const candidates = computed(() =>
  props.projects.filter((p) => p.id !== props.project?.id),
);

function select(resource: ResourceId, tier: TierId): void {
  selected.value = { resource, tier };
}

function step(delta: 1 | -1): void {
  if (!selected.value) return;
  const { resource, tier } = selected.value;
  cost.value[resource][tier] = Math.max(0, cost.value[resource][tier] + delta);
}

function save(): void {
  emit("save", {
    code: code.value.trim(),
    name: name.value.trim(),
    prerequisite_id: prerequisite.value || null,
    cost: cost.value,
  });
}
</script>

<style scoped lang="scss">
.editor {
  padding: 16px;
  max-width: 480px;
}
.editor__title {
  font-size: 16px;
  margin: 0 0 12px;
}
.editor__label {
  display: block;
  font-size: 13px;
  margin: 8px 0 4px;
}
.editor__field {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 8px;
  font-size: 15px;
}
.editor__actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 16px;
}
</style>
