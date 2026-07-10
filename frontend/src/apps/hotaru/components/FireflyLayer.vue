<template>
  <div class="firefly-layer" aria-hidden="true" data-testid="firefly-layer">
    <span v-for="f in fireflies" :key="f.id" class="firefly" :style="f.style" />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

// Wandering fireflies (UX-DR2): each is a glowing dot drifting on its own
// randomised path + pulse. Pure CSS animation driven by per-firefly custom
// properties; `prefers-reduced-motion` falls back to static dim dots (styles).
interface Firefly {
  id: number;
  style: Record<string, string>;
}

const COUNT = 18;

const fireflies = ref<Firefly[]>(
  Array.from({ length: COUNT }, (_, id) => {
    const dur = 9 + Math.random() * 11; // 9–20s drift
    return {
      id,
      style: {
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        "--dx": `${(Math.random() * 2 - 1) * 46}px`,
        "--dy": `${(Math.random() * 2 - 1) * 46}px`,
        "--size": `${2 + Math.random() * 2.5}px`,
        "--dur": `${dur}s`,
        "--pulse": `${2.4 + Math.random() * 2.6}s`,
        "--delay": `${-Math.random() * dur}s`,
      },
    };
  }),
);
</script>

<style scoped lang="sass">
.firefly-layer
  position: absolute
  inset: 0
  z-index: -1
  overflow: hidden
  pointer-events: none

.firefly
  position: absolute
  width: var(--size)
  height: var(--size)
  border-radius: 50%
  background: var(--hotaru-firefly, #fff0a8)
  box-shadow: 0 0 6px 2px rgba(255, 240, 168, 0.7), 0 0 16px 6px rgba(255, 210, 74, 0.32)
  opacity: 0
  will-change: transform, opacity
  animation: firefly-drift var(--dur) ease-in-out infinite var(--delay), firefly-pulse var(--pulse) ease-in-out infinite var(--delay)

@keyframes firefly-drift
  0%
    transform: translate(0, 0)
  25%
    transform: translate(var(--dx), var(--dy))
  50%
    transform: translate(calc(var(--dx) * -0.5), calc(var(--dy) * 0.7))
  75%
    transform: translate(calc(var(--dx) * 0.6), calc(var(--dy) * -0.6))
  100%
    transform: translate(0, 0)

@keyframes firefly-pulse
  0%, 100%
    opacity: 0.12
  50%
    opacity: 0.9

@media (prefers-reduced-motion: reduce)
  .firefly
    animation: none
    opacity: 0.35
</style>
