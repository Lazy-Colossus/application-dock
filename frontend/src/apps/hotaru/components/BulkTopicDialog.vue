<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="bt-dialog" data-testid="bulk-topic-dialog">
      <div class="bt-title">Add {{ count }} to a topic</div>

      <div v-if="topics.length === 0" class="bt-empty">
        No topics yet — create one below.
      </div>
      <button
        v-for="t in topics"
        :key="t.id"
        class="bt-row"
        :data-testid="`bulk-topic-pick-${t.id}`"
        @click="pick(t.id)"
      >
        <q-icon name="sell" size="16px" />
        <span class="bt-name">{{ t.name }}</span>
      </button>

      <div class="bt-new row items-center q-gutter-xs q-mt-sm">
        <input
          v-model="newName"
          class="bt-input col"
          placeholder="New topic"
          data-testid="bulk-topic-new-input"
          @keyup.enter="onCreate"
        />
        <q-btn
          label="Add"
          no-caps
          unelevated
          :disable="!newName.trim()"
          data-testid="bulk-topic-new-add"
          @click="onCreate"
        />
      </div>

      <div class="row justify-end q-mt-md">
        <q-btn
          flat
          no-caps
          label="Cancel"
          data-testid="bulk-topic-cancel"
          @click="emit('update:modelValue', false)"
        />
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { Topic } from "@/apps/hotaru/types";

defineProps<{ topics: Topic[]; count: number; modelValue: boolean }>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  pick: [topicId: string];
  create: [name: string];
}>();

const newName = ref("");

function pick(topicId: string): void {
  emit("pick", topicId);
}

function onCreate(): void {
  const name = newName.value.trim();
  if (!name) return;
  emit("create", name);
  newName.value = "";
}
</script>

<style scoped lang="sass">
.bt-dialog
  background: rgba(20, 18, 52, 0.98)
  color: #f1f0ff
  border: 1px solid rgba(155, 107, 255, 0.30)
  border-radius: 14px
  padding: 18px
  min-width: 280px

.bt-title
  font-size: 16px
  font-weight: 600
  margin-bottom: 10px

.bt-empty
  color: #b3aede
  font-size: 13px

.bt-row
  display: flex
  align-items: center
  gap: 10px
  width: 100%
  padding: 8px 6px
  border: none
  border-radius: 8px
  background: transparent
  color: #f1f0ff
  font-size: 14px
  text-align: left
  cursor: pointer

.bt-row:hover
  background: rgba(155, 107, 255, 0.14)

.bt-input
  background: rgba(4, 6, 15, 0.5)
  border: 1px solid rgba(155, 107, 255, 0.30)
  border-radius: 10px
  padding: 8px
  color: #f1f0ff
  font-size: 14px
</style>
