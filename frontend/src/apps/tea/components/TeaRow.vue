<template>
  <div :class="['row', { 'row--empty': empty }]" data-testid="row">
    <div class="row__body" data-testid="row-body" @click="emit('open', tea.id)">
      <div class="row__name row__name--truncate" data-testid="row-name">
        {{ tea.name }}
        <span v-if="nameZh" class="row__zh" lang="zh" data-testid="row-zh">{{ nameZh }}</span>
      </div>
      <div class="row__path" data-testid="row-path">{{ path }}</div>
    </div>
    <div class="row__rim" data-testid="row-rim" @click.stop="emit('edit-grams', tea.id)">
      <RimGauge
        :proportion="proportion"
        :threshold-fraction="thresholdFraction"
        :low="low"
        :empty="empty"
        :color="color"
        :value="tea.grams_remaining"
        :caption="caption"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import RimGauge from "./RimGauge.vue";
import { CLASS_TOKENS } from "../tokens";
import { proportionOf, thresholdFractionOf, isLow } from "../shelf";
import type { Tea } from "../types";

const props = defineProps<{ tea: Tea; path: string; nameZh: string }>();
const emit = defineEmits<{ open: [teaId: string]; "edit-grams": [teaId: string] }>();

const proportion = computed(() => proportionOf(props.tea));
const thresholdFraction = computed(() => thresholdFractionOf(props.tea));
const low = computed(() => isLow(props.tea));
const empty = computed(() => props.tea.grams_remaining <= 0);
const color = computed(() => CLASS_TOKENS[props.tea.class_id]?.liquor ?? CLASS_TOKENS.other.liquor);
const caption = computed(() =>
  props.tea.grams_purchased ? `of ${props.tea.grams_purchased}g` : null,
);
</script>

<style scoped lang="scss">
.row {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 8px 0;
  position: relative;
  z-index: 2;
}
.row__body {
  flex: 1;
  // Without this a long name widens the flex item and pushes the rim off
  // screen instead of truncating (Review Focus 4).
  min-width: 0;
  cursor: pointer;
}
.row__name {
  color: #efe7da;
  font-size: 16.5px;
  line-height: 1.28;
}
.row__name--truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row__zh {
  color: #a99781;
  font-size: 13.5px;
  font-weight: 300;
  margin-left: 7px;
}
.row__path {
  color: #6b5f52;
  font-size: 12.5px;
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row__rim {
  flex: none;
  cursor: pointer;
}
.row--empty .row__name,
.row--empty .row__path {
  color: #574d43;
}
.row--empty .row__zh {
  color: #4a4239;
}
</style>
