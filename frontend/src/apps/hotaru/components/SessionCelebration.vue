<template>
  <div class="cel" data-testid="session-celebration" aria-hidden="true">
    <span
      v-for="f in flies"
      :key="f.i"
      class="cel__fly"
      :style="{
        '--a': f.a,
        '--far': f.far,
        animationDelay: f.delay,
        animationDuration: f.dur,
      }"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

// A one-shot firefly gathering for the session recap: particles fade in scattered
// around the ring, converge on its rim, settle with a little bounce, then dissolve
// into the page's ambient fireflies. Deterministic positions (no Math.random) so
// the burst is stable across renders.
const props = withDefaults(defineProps<{ count?: number }>(), { count: 14 });

const flies = computed(() =>
  Array.from({ length: props.count }, (_, i) => ({
    i,
    a: `${Math.round((360 / props.count) * i)}deg`,
    far: `${86 + (i % 5) * 9}px`,
    delay: `${(i % 7) * 60}ms`,
    dur: `${1700 + (i % 4) * 200}ms`,
  })),
);
</script>

<style scoped lang="sass">
.cel
  position: absolute
  inset: 0
  pointer-events: none

.cel__fly
  position: absolute
  top: 50%
  left: 50%
  width: 4px
  height: 4px
  border-radius: 50%
  background: #ffe89a
  box-shadow: 0 0 8px 2px rgba(255, 210, 74, 0.8)
  opacity: 0
  transform-origin: center
  animation-name: cel-gather
  animation-timing-function: cubic-bezier(0.25, 0.9, 0.3, 1)
  animation-iteration-count: 1
  animation-fill-mode: forwards

// Radial gather: out at `--far` along angle `--a`, in to the rim (~72px), a small
// settle bounce, then fade. rotate(var(--a)) is constant, so only radius/opacity move.
@keyframes cel-gather
  0%
    transform: translate(-50%, -50%) rotate(var(--a)) translateX(var(--far)) scale(0.7)
    opacity: 0
  18%
    opacity: 1
  60%
    transform: translate(-50%, -50%) rotate(var(--a)) translateX(74px) scale(1)
    opacity: 1
  74%
    transform: translate(-50%, -50%) rotate(var(--a)) translateX(66px) scale(1.1)
  86%
    transform: translate(-50%, -50%) rotate(var(--a)) translateX(74px) scale(1)
    opacity: 0.9
  100%
    transform: translate(-50%, -50%) rotate(var(--a)) translateX(72px) scale(0.85)
    opacity: 0

@media (prefers-reduced-motion: reduce)
  .cel
    display: none
</style>
