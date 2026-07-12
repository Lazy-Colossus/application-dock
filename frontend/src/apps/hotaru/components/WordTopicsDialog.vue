<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="wt-dialog" data-testid="topic-dialog">
      <div class="wt-title">Topics for “{{ word.kanji ?? word.reading }}”</div>

      <div v-if="topics.length === 0" class="wt-empty">
        No topics yet — create one below.
      </div>
      <label v-for="t in topics" :key="t.id" class="wt-row">
        <input
          type="checkbox"
          :checked="isMember(t)"
          :data-testid="`topic-checkbox-${t.id}`"
          @change="toggle(t)"
        />
        <span class="wt-name">{{ t.name }}</span>
      </label>

      <div class="wt-new row items-center q-gutter-xs q-mt-sm">
        <input
          v-model="newName"
          class="wt-input col"
          placeholder="New topic"
          data-testid="new-topic-input"
          @keyup.enter="onCreate"
        />
        <q-btn
          label="Add"
          no-caps
          unelevated
          :disable="!newName.trim()"
          data-testid="new-topic-add"
          @click="onCreate"
        />
      </div>

      <div class="row justify-end q-mt-md">
        <q-btn
          flat
          no-caps
          label="Done"
          data-testid="topic-done"
          @click="emit('update:modelValue', false)"
        />
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { Word, Topic } from "@/apps/hotaru/types";

const props = defineProps<{
  word: Word;
  topics: Topic[];
  modelValue: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  assign: [topicId: string, wordId: string];
  unassign: [topicId: string, wordId: string];
  create: [name: string];
}>();

const newName = ref("");

function isMember(t: Topic): boolean {
  return t.word_ids.includes(props.word.id);
}

function toggle(t: Topic): void {
  if (isMember(t)) emit("unassign", t.id, props.word.id);
  else emit("assign", t.id, props.word.id);
}

function onCreate(): void {
  const name = newName.value.trim();
  if (!name) return;
  emit("create", name);
  newName.value = "";
}
</script>

<style scoped lang="sass">
// q-dialog teleports to <body>, outside the `.hotaru-app` scope — so the
// --hotaru-* CSS vars don't resolve here (they'd fall back to the old forest
// green). Hardcode the Neon Yūgure dusk palette instead.
.wt-dialog
  background: rgba(20, 18, 52, 0.98)
  backdrop-filter: blur(16px)
  color: #f1f0ff
  border: 1px solid rgba(155, 107, 255, 0.30)
  border-radius: 14px
  padding: 18px
  min-width: 280px

.wt-title
  font-size: 16px
  font-weight: 600
  margin-bottom: 10px

.wt-empty
  color: #b3aede
  font-size: 13px

.wt-row
  display: flex
  align-items: center
  gap: 10px
  padding: 6px 0
  cursor: pointer

// Tint the native membership checkboxes cyan (else the browser-default green).
.wt-row input[type="checkbox"]
  accent-color: #38f0e6

.wt-name
  font-size: 14px

.wt-input
  background: rgba(4, 6, 15, 0.5)
  border: 1px solid rgba(155, 107, 255, 0.30)
  border-radius: 10px
  padding: 8px
  color: #f1f0ff
  font-size: 14px
</style>
