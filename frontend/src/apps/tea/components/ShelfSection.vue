<template>
  <section class="section" data-testid="section">
    <ClassLeaves :class-id="section.classId" :index="index" :active="active" />
    <div class="section__pad">
      <header class="section__head">
        <span class="section__name" :style="{ color: tokens.head }" data-testid="section-name">
          {{ tokens.label }}
        </span>
        <span class="section__zh" :style="{ color: tokens.zh }" lang="zh" data-testid="section-zh">
          {{ tokens.labelZh }}
        </span>
      </header>
      <TeaRow
        v-for="tea in section.teas"
        :key="tea.id"
        :tea="tea"
        :path="pathFor(tea)"
        :name-zh="nameZhFor(tea)"
        @open="emit('open', $event)"
        @edit-grams="emit('edit-grams', $event)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ClassLeaves from "./ClassLeaves.vue";
import TeaRow from "./TeaRow.vue";
import { CLASS_TOKENS } from "../tokens";
import type { ShelfSectionData } from "../shelf";
import type { Tea } from "../types";

const props = defineProps<{
  section: ShelfSectionData;
  index: number;
  active: boolean;
  pathFor: (tea: Tea) => string;
  nameZhFor: (tea: Tea) => string;
}>();
const emit = defineEmits<{ open: [teaId: string]; "edit-grams": [teaId: string] }>();

const tokens = computed(() => CLASS_TOKENS[props.section.classId]);
</script>

<style scoped lang="scss">
.section {
  position: relative;
  padding: 10px 0 22px;
}
.section__pad {
  position: relative;
  z-index: 2;
  padding: 0 18px;
}
.section__head {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 9px;
}
.section__name {
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.04em;
}
.section__zh {
  font-size: 12.5px;
  font-weight: 300;
}
</style>
