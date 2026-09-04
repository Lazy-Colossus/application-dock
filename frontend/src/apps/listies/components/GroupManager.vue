<template>
  <div
    class="group-manager column q-gutter-sm q-pa-md"
    data-testid="group-manager"
  >
    <div class="group-manager__title text-caption">Place groups</div>

    <div
      v-if="draft.length === 0"
      class="group-manager__empty text-caption"
      data-testid="group-manager-empty"
    >
      No groups yet — add one to start colouring pins.
    </div>

    <div
      v-for="(group, index) in draft"
      :key="group.id"
      class="row items-center q-gutter-sm no-wrap"
    >
      <q-btn dense flat round :data-testid="`group-colour-${index}`">
        <span
          class="group-manager__swatch"
          :style="{ background: group.color }"
        />
        <q-popup-proxy>
          <q-color
            :model-value="group.color"
            format-model="hex"
            no-header
            no-footer
            :data-testid="`group-colour-picker-${index}`"
            @update:model-value="setColour(index, $event)"
          />
        </q-popup-proxy>
      </q-btn>

      <q-input
        dense
        outlined
        class="col"
        placeholder="Group name"
        :model-value="group.name"
        :data-testid="`group-name-${index}`"
        @update:model-value="setName(index, String($event ?? ''))"
        @blur="commit"
        @keyup.enter="commit"
      />

      <q-btn
        dense
        flat
        round
        icon="delete"
        :data-testid="`group-delete-${index}`"
        @click="remove(index)"
      />
    </div>

    <div>
      <q-btn
        dense
        flat
        no-caps
        icon="add"
        label="Add group"
        data-testid="group-add"
        @click="add"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import type { PlaceGroup } from "@/apps/listies/types";

/**
 * Manage a tab's place groups (Story 4.6).
 *
 * Controlled by the parent: it holds a working `draft` copy, mutates it, and
 * emits `save` with the whole list on each committed change (add, rename on
 * blur/Enter, recolour, delete). The parent persists it through the store; the
 * updated groups flow back in via `groups`, which re-syncs the draft.
 */
const props = defineProps<{ groups: PlaceGroup[] }>();
const emit = defineEmits<{ save: [groups: PlaceGroup[]] }>();

// Distinct hues so a fresh group is not born the same colour as the last one.
const PALETTE = ["#e5484d", "#3e63dd", "#46a758", "#f76b15", "#8e4ec6"];

const draft = ref<PlaceGroup[]>(clone(props.groups));

function clone(groups: PlaceGroup[]): PlaceGroup[] {
  return groups.map((group) => ({ ...group }));
}

// Re-sync when the persisted groups change (e.g. after a save round-trip). A
// rename only mutates the draft locally until blur, so this does not fight the
// user mid-type.
watch(
  () => props.groups,
  (groups) => {
    draft.value = clone(groups);
  },
);

function newGroupId(): string {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Math.random()}`;
  return `g-${uuid.replace(/-/g, "").slice(0, 8)}`;
}

function commit(): void {
  emit("save", clone(draft.value));
}

function setName(index: number, name: string): void {
  // Local only — persisted on blur/Enter so a rename is not one write per key.
  const group = draft.value[index];
  if (group) group.name = name;
}

function setColour(index: number, color: string | null): void {
  const group = draft.value[index];
  if (!group || color == null) return;
  group.color = color;
  commit();
}

function add(): void {
  draft.value.push({
    id: newGroupId(),
    name: "",
    color: PALETTE[draft.value.length % PALETTE.length]!,
  });
  commit();
}

function remove(index: number): void {
  draft.value.splice(index, 1);
  commit();
}
</script>

<style scoped>
.group-manager {
  min-width: 16rem;
}

.group-manager__title {
  opacity: 0.6;
}

.group-manager__swatch {
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  display: inline-block;
  border: 1px solid rgba(255, 255, 255, 0.3);
}
</style>
