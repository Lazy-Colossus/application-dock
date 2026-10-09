<template>
  <div
    :class="['strip', { 'strip--near': near, 'strip--reached': reached }]"
    data-testid="brew-strip"
  >
    <button class="strip__back" data-testid="brew-strip-back" @click="emit('back')">
      <span class="strip__dot" :style="{ background: timer.liquor }"></span>
      Inf {{ timer.current?.number ?? 1 }} · {{ formatElapsed(elapsed) }} /
      {{ formatElapsed(target) }}
      <span
        v-if="timer.unsynced"
        class="strip__unsynced"
        data-testid="brew-strip-unsynced"
        title="Not synced yet — it will retry"
      ></span>
    </button>
    <button
      class="strip__toggle"
      data-testid="brew-strip-toggle"
      :aria-label="timer.running ? 'Stop the steep' : 'Start the steep'"
      @click="onToggle"
    >
      {{ timer.running ? "■" : "▶" }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useTeaTimerStore } from "../stores/useTeaTimerStore";
import { useSteepClock } from "../composables/useSteepClock";
import { useTargetChime } from "../composables/useTargetChime";
import { useWakeLock } from "../composables/useWakeLock";
import { TARGET_LEVEL, formatElapsed, targetFor } from "../timer";

const emit = defineEmits<{ back: [] }>();
const timer = useTeaTimerStore();

const steepStartedAt = computed(() => timer.live?.steepStartedAt ?? null);
const { elapsed } = useSteepClock(steepStartedAt);
const target = computed(() => timer.current?.target_seconds ?? targetFor([], 1));
const { unlock } = useTargetChime(
  elapsed,
  computed(() => (timer.running ? target.value : null)),
  computed(() => timer.chimeOn),
);
useWakeLock(computed(() => timer.live !== null));

const reached = computed(() => timer.running && elapsed.value >= target.value);
const near = computed(
  () => timer.running && !reached.value && elapsed.value >= target.value * TARGET_LEVEL,
);

function onToggle(): void {
  if (timer.running) {
    void timer.stop();
  } else {
    unlock();
    timer.start();
  }
}
</script>

<style scoped lang="scss">
.strip {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  background: #1e1712;
  border-bottom: 1px solid #241e19;
  padding: 8px 12px 8px 16px;
  transition: background 0.3s;
}
.strip--near {
  background: #3a2a14;
}
.strip--reached {
  animation: strip-pulse 0.9s ease-out 1;
  background: #5a3d12;
}
@keyframes strip-pulse {
  from {
    background: #a8742a;
  }
}
.strip__back {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: 0;
  color: #efe7da;
  font-family: inherit;
  font-size: 16px;
  font-variant-numeric: tabular-nums;
  text-align: left;
  cursor: pointer;
}
.strip__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.strip__unsynced {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #8b7a63;
}
.strip__toggle {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid #6b5f52;
  background: transparent;
  color: #efe7da;
  font-size: 16px;
  cursor: pointer;
}
</style>
