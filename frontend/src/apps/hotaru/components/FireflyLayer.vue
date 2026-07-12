<template>
  <div class="firefly-layer" aria-hidden="true" data-testid="firefly-layer">
    <span v-for="f in fireflies" :key="f.id" class="firefly" :style="f.style" />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

// Wandering neon fireflies (Neon Yūgure): amber, cyan and magenta dots drifting
// on their own randomised paths + bloom pulse. Pure CSS animation driven by
// per-firefly custom properties; `prefers-reduced-motion` falls back to static
// dim dots (styles).
interface Firefly {
  id: number;
  style: Record<string, string>;
}

const COUNT = 22;

// Amber (firefly), cyan (primary), violet — the Neon Yūgure motion palette.
const COLOURS = ["255, 206, 92", "56, 240, 230", "155, 107, 255"];

const fireflies = ref<Firefly[]>(
  Array.from({ length: COUNT }, (_, id) => {
    const dur = 9 + Math.random() * 11; // 9–20s drift
    return {
      id,
      style: {
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        "--c": COLOURS[id % COLOURS.length],
        "--dx": `${(Math.random() * 2 - 1) * 50}px`,
        "--dy": `${(Math.random() * 2 - 1) * 50}px`,
        "--size": `${3 + Math.random() * 3}px`,
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
  background: rgb(var(--c))
  box-shadow: 0 0 8px 2px rgba(var(--c), 0.75), 0 0 20px 7px rgba(var(--c), 0.4)
  opacity: 0
  will-change: transform, opacity
  animation: firefly-drift var(--dur) ease-in-out infinite var(--delay), firefly-pulse var(--pulse) ease-in-out infinite var(--delay)

@keyframes firefly-drift
  0%
    transform: translate(0, 0) scale(0.7)
  25%
    transform: translate(var(--dx), var(--dy)) scale(1.1)
  50%
    transform: translate(calc(var(--dx) * -0.5), calc(var(--dy) * 0.7)) scale(0.9)
  75%
    transform: translate(calc(var(--dx) * 0.6), calc(var(--dy) * -0.6)) scale(1.2)
  100%
    transform: translate(0, 0) scale(0.7)

@keyframes firefly-pulse
  0%, 100%
    opacity: 0.15
  50%
    opacity: 1

@media (prefers-reduced-motion: reduce)
  .firefly
    animation: none
    opacity: 0.4
</style>
