<template>
  <section class="section" data-testid="ware-section">
    <header class="section__head">
      <span class="section__name" data-testid="ware-section-name">{{ labels.label }}</span>
      <span class="section__zh" lang="zh">{{ labels.labelZh }}</span>
    </header>
    <div :class="['section__strip', { 'section__strip--two-rows': section.items.length > 6 }]">
      <WareCard
        v-for="item in section.items"
        :key="item.id"
        :item="item"
        @open="emit('open', $event)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import WareCard from "./WareCard.vue";
import { WARE_TYPE_LABELS, type WareSectionData } from "../ware";

const props = defineProps<{ section: WareSectionData }>();
const emit = defineEmits<{ open: [teawareId: string] }>();

const labels = computed(() => WARE_TYPE_LABELS[props.section.type]);
</script>

<style scoped lang="scss">
// The tea shelf's strip layout (ShelfSection.vue), without the class leaves.
.section {
  padding: 10px 0 22px;
}
.section__head {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 9px;
  padding: 0 18px;
}
.section__name {
  color: #e4d9c6;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.04em;
}
.section__zh {
  color: #a99781;
  font-size: 12.5px;
  font-weight: 300;
}
.section__strip {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 112px;
  align-items: start;
  gap: 16px 12px;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scroll-padding: 0 18px;
  padding: 0 18px 4px;
  scrollbar-width: none;
}
.section__strip--two-rows {
  grid-template-rows: auto auto;
}
.section__strip::-webkit-scrollbar {
  display: none;
}
</style>
