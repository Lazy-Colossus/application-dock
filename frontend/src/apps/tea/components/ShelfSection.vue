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
    </div>
    <div
      :class="['section__strip', { 'section__strip--two-rows': twoRows }]"
      data-testid="section-strip"
    >
      <TeaCard
        v-for="tea in section.teas"
        :key="tea.id"
        :tea="tea"
        :name-zh="nameZhFor(tea)"
        @open="emit('open', $event)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ClassLeaves from "./ClassLeaves.vue";
import TeaCard from "./TeaCard.vue";
import { CLASS_TOKENS } from "../tokens";
import type { ShelfSectionData } from "../shelf";
import type { Tea } from "../types";

const props = defineProps<{
  section: ShelfSectionData;
  index: number;
  active: boolean;
  nameZhFor: (tea: Tea) => string;
}>();
const emit = defineEmits<{ open: [teaId: string] }>();

const tokens = computed(() => CLASS_TOKENS[props.section.classId]);
const twoRows = computed(() => props.section.teas.length > 6);
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
.section__strip {
  position: relative;
  z-index: 2;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 112px;
  // Cards are buttons, which centre their content; pinning each to the top
  // keeps the pictures level when one name wraps to two lines and another
  // does not.
  align-items: start;
  gap: 16px 12px;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scroll-padding: 0 18px;
  padding: 0 18px 4px;
  scrollbar-width: none;
}
// Column flow fills top-then-bottom, so alphabetical neighbours stay side by
// side while scrolling rather than splitting the list across the two rows.
.section__strip--two-rows {
  grid-template-rows: auto auto;
}
.section__strip::-webkit-scrollbar {
  display: none;
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
