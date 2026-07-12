<template>
  <div class="grades row no-wrap">
    <button
      class="grade grade--incorrect"
      data-testid="grade-incorrect"
      @click="emit('grade', 'incorrect')"
    >
      Incorrect
    </button>
    <button
      class="grade grade--close"
      data-testid="grade-close"
      @click="emit('grade', 'close')"
    >
      Close
    </button>
    <button
      class="grade grade--correct"
      data-testid="grade-correct"
      @click="emit('grade', 'correct')"
    >
      Correct
    </button>
  </div>
</template>

<script setup lang="ts">
import type { DrillGrade } from "@/apps/hotaru/types";

const emit = defineEmits<{ grade: [grade: DrillGrade] }>();
</script>

<style scoped lang="sass">
// Three equal-width, bare-label grade buttons — each with its tier-hue neon
// edge (Incorrect magenta, Close amber, Correct cyan). No subtext.
.grades
  gap: 9px

.grade
  flex: 1
  border-radius: 14px
  padding: 13px 6px
  font-size: 14px
  font-weight: 700
  cursor: pointer
  background: rgba(255, 255, 255, 0.04)
  border: 1px solid transparent

.grade--incorrect
  border-color: rgba(255, 92, 200, 0.55)
  color: var(--hotaru-fam-5)
  box-shadow: 0 0 22px rgba(255, 92, 200, 0.2)

.grade--close
  border-color: rgba(255, 206, 92, 0.6)
  color: var(--hotaru-amber-private)
  box-shadow: 0 0 22px rgba(255, 206, 92, 0.22)

.grade--correct
  border-color: rgba(56, 240, 230, 0.6)
  color: var(--hotaru-bamboo)
  box-shadow: 0 0 22px rgba(56, 240, 230, 0.22)
</style>
