<template>
  <div class="practice-opts column">
    <div class="practice-opt row items-center justify-between">
      <span class="practice-opt__label">Direction</span>
      <div class="practice-seg row no-wrap">
        <button
          class="practice-seg__btn"
          :class="{ 'practice-seg__btn--on': direction === 'r2m' }"
          data-testid="dir-r2m"
          @click="setDirection('r2m')"
        >
          JP → EN
        </button>
        <button
          class="practice-seg__btn"
          :class="{ 'practice-seg__btn--on': direction === 'm2r' }"
          data-testid="dir-m2r"
          @click="setDirection('m2r')"
        >
          EN → JP
        </button>
      </div>
    </div>
    <div class="practice-opt row items-center justify-between">
      <span class="practice-opt__label">Scoring</span>
      <div class="practice-seg row no-wrap">
        <button
          class="practice-seg__btn"
          :class="{ 'practice-seg__btn--on': mode === 'self' }"
          data-testid="mode-self"
          @click="emit('update:mode', 'self')"
        >
          Self-grade
        </button>
        <button
          class="practice-seg__btn"
          :class="{ 'practice-seg__btn--on': mode === 'typed' }"
          :disabled="direction === 'r2m'"
          data-testid="mode-typed"
          @click="emit('update:mode', 'typed')"
        >
          Typed
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Direction (recognition JP→EN vs production EN→JP) + scoring (self-grade vs
// typed). Typed is EN→JP-only, so choosing JP→EN forces scoring back to
// self-grade. Shared by Quick Practice and a chosen scope via v-model.
type Direction = "r2m" | "m2r";
type ScoringMode = "self" | "typed";

defineProps<{ direction: Direction; mode: ScoringMode }>();
const emit = defineEmits<{
  "update:direction": [Direction];
  "update:mode": [ScoringMode];
}>();

function setDirection(d: Direction): void {
  emit("update:direction", d);
  if (d === "r2m") emit("update:mode", "self");
}
</script>

<style scoped lang="sass">
.practice-opts
  gap: 10px

.practice-opt__label
  font-size: 13px
  color: var(--hotaru-cream-soft)

// Compact segmented control (mobile-first) — a rounded track with two pills.
.practice-seg
  border: 1px solid rgba(155, 107, 255, 0.30)
  border-radius: 9999px
  overflow: hidden

.practice-seg__btn
  border: none
  background: transparent
  color: var(--hotaru-cream-soft)
  padding: 5px 14px
  font-size: 13px
  cursor: pointer

.practice-seg__btn--on
  background: var(--hotaru-bamboo)
  color: var(--hotaru-bamboo-on)

.practice-seg__btn:disabled
  color: var(--hotaru-sage)
  cursor: not-allowed
</style>
