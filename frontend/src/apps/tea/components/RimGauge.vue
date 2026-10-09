<template>
  <div :class="['rim', { 'rim--page': size === 'page', 'rim--empty': empty }]" data-testid="rim">
    <svg :width="rim.box" :height="rim.box" :viewBox="`0 0 ${rim.box} ${rim.box}`">
      <circle
        data-testid="rim-track"
        :cx="centre"
        :cy="centre"
        :r="rim.radius"
        fill="none"
        :stroke="empty ? GROUND.trackOut : GROUND.track"
        :stroke-width="rim.stroke"
      />
      <circle
        v-if="proportion !== null && proportion > 0 && !empty"
        data-testid="rim-fill"
        :cx="centre"
        :cy="centre"
        :r="rim.radius"
        fill="none"
        :stroke="color"
        :stroke-width="rim.stroke"
        stroke-linecap="round"
        :stroke-dasharray="dash"
        :transform="`rotate(-90 ${centre} ${centre})`"
      />
      <line
        v-if="thresholdFraction !== null"
        data-testid="rim-tick"
        :x1="centre"
        :y1="centre - rim.radius - rim.stroke"
        :x2="centre"
        :y2="centre - rim.radius - rim.stroke - 5"
        :stroke="GROUND.inkLo"
        stroke-width="1.2"
        :transform="`rotate(${thresholdFraction * 360} ${centre} ${centre})`"
      />
      <text
        data-testid="rim-value"
        :x="centre"
        :y="centre + valueOffset"
        text-anchor="middle"
        class="rim__value"
        :fill="valueColor"
      >
        {{ value }}
      </text>
    </svg>
    <span v-if="caption" class="rim__caption" data-testid="rim-caption">{{ caption }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RIM, circumferenceOf, dashPattern } from "../gauge";
import { GROUND } from "../tokens";

const props = withDefaults(
  defineProps<{
    /** 0..1, or null when the amount bought is unknown. */
    proportion: number | null;
    thresholdFraction: number | null;
    low: boolean;
    empty: boolean;
    /** The tea class's liquor colour. The only hue this component draws. */
    color: string;
    value: number;
    caption: string | null;
    size?: "shelf" | "page";
  }>(),
  { size: "shelf" },
);

const rim = computed(() => RIM[props.size]);
const centre = computed(() => rim.value.box / 2);
const circumference = computed(() => circumferenceOf(rim.value.radius));
const dash = computed(() =>
  dashPattern((props.proportion ?? 0) * circumference.value, circumference.value, props.low),
);
// Rough vertical centring of the baseline against the larger page-size digits.
const valueOffset = computed(() => (props.size === "page" ? 8 : 5));
// At 0g the number joins the rim in ink-out; otherwise the page's larger
// number gets the brighter ink-hi (DESIGN.md typography table), the shelf
// number the plainer ink.
const valueColor = computed(() =>
  props.empty ? GROUND.inkOut : props.size === "page" ? GROUND.inkHi : GROUND.ink,
);
</script>

<style scoped lang="scss">
.rim {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.rim__value {
  font-family: "Newsreader", serif;
  font-size: 15px;
  font-weight: 500;
}
.rim--page .rim__value {
  font-size: 25px;
}
.rim__caption {
  display: block;
  color: v-bind("GROUND.inkLo");
  font-size: 10.5px;
  margin-top: 2px;
}
</style>
