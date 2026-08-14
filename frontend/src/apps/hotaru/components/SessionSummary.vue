<template>
  <div class="sum column no-wrap" data-testid="session-summary">
    <div class="sum__head hotaru-panel row no-wrap items-center">
      <!-- Breakdown ring: a donut split by this session's grade mix. -->
      <div class="sum__ring" data-testid="summary-ring">
        <svg class="sum__svg" viewBox="0 0 120 120" aria-hidden="true">
          <circle class="sum__track" cx="60" cy="60" r="46" />
          <circle
            v-for="seg in ringSegments"
            :key="seg.grade"
            class="sum__seg"
            :class="{ 'sum__seg--dim': dimmed(seg.grade) }"
            :data-testid="`ring-seg-${seg.grade}`"
            cx="60"
            cy="60"
            r="46"
            fill="none"
            stroke="currentColor"
            stroke-width="11"
            :stroke-dasharray="seg.dasharray"
            :stroke-dashoffset="seg.dashoffset"
            :style="{ color: GRADE_COLOR[seg.grade] }"
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div class="sum__center">
          <div class="sum__count" data-testid="summary-practised">
            {{ results.length }}
          </div>
          <div class="sum__unit">
            {{ results.length === 1 ? "word" : "words" }}
          </div>
        </div>
        <SessionCelebration />
      </div>

      <!-- Tallies double as multi-select filters over the list below. -->
      <div class="sum__tallies col column">
        <button
          v-for="g in GRADE_ORDER"
          :key="g"
          class="sum__tally row items-center no-wrap"
          :class="[`sum__tally--${g}`, { 'sum__tally--on': isOn(g) }]"
          :aria-pressed="isOn(g)"
          :aria-label="`${GRADE_LABEL[g]}: ${counts[g]}. Filter the list.`"
          :data-testid="`tally-${g}`"
          @click="emit('toggle', g)"
        >
          <i class="sum__pip" />
          <span class="sum__name col">{{ GRADE_LABEL[g] }}</span>
          <b class="sum__n">{{ counts[g] }}</b>
        </button>
      </div>
    </div>

    <div class="sum__fline row items-center justify-between">
      <span data-testid="summary-filter-label">{{ filterLabel }}</span>
      <button
        v-if="selected.length"
        class="sum__clear"
        data-testid="summary-clear"
        @click="emit('clear')"
      >
        Show all
      </button>
    </div>

    <!-- Every word met this session, in the order it came up. -->
    <div class="sum__list hotaru-panel col" data-testid="summary-list">
      <div
        v-for="(r, i) in visible"
        :key="`${r.word.id}-${i}`"
        class="sum__row row items-center no-wrap"
        :data-testid="`summary-row-${r.word.id}`"
      >
        <div class="sum__word col">
          <div class="sum__jp" :class="{ 'sum__jp--kana': !r.word.kanji }">
            {{ r.word.kanji ?? r.word.reading }}
          </div>
          <div v-if="r.word.kanji" class="sum__reading">
            {{ r.word.reading }}
          </div>
          <div class="sum__meaning">{{ r.word.meaning }}</div>
        </div>
        <!-- The grade reads as a WORD, not a hue (accessibility floor). -->
        <span
          class="sum__grade"
          :class="`sum__grade--${r.grade}`"
          :data-testid="`summary-grade-${r.word.id}`"
        >
          {{ GRADE_LABEL[r.grade] }}
        </span>
      </div>
    </div>

    <div class="sum__actions column">
      <q-btn
        v-if="replayTargets.length"
        class="sum__cta"
        unelevated
        no-caps
        :label="replayLabel"
        data-testid="summary-replay"
        @click="emit('replay')"
      />
      <q-btn
        class="sum__close"
        unelevated
        no-caps
        label="Close"
        data-testid="drill-done-btn"
        @click="emit('close')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import SessionCelebration from "@/apps/hotaru/components/SessionCelebration.vue";
import type { DrillGrade, SessionResult } from "@/apps/hotaru/types";

// The end-of-session recap: a breakdown ring, the three grade tallies as
// multi-select filters, and every word met this session with the result it got.
// Selecting tallies re-scopes BOTH the list and the replay button, so what the
// learner sees is exactly what re-running will drill.
const props = defineProps<{
  results: SessionResult[];
  selected: DrillGrade[];
}>();

const emit = defineEmits<{
  toggle: [DrillGrade];
  clear: [];
  replay: [];
  close: [];
}>();

const GRADE_ORDER: DrillGrade[] = ["correct", "close", "incorrect"];
const GRADE_LABEL: Record<DrillGrade, string> = {
  correct: "Correct",
  close: "Close",
  incorrect: "Incorrect",
};
const GRADE_COLOR: Record<DrillGrade, string> = {
  correct: "var(--hotaru-bamboo)",
  close: "var(--hotaru-amber-private)",
  incorrect: "var(--hotaru-fam-5)",
};

const counts = computed<Record<DrillGrade, number>>(() => {
  const c: Record<DrillGrade, number> = { correct: 0, close: 0, incorrect: 0 };
  for (const r of props.results) c[r.grade] += 1;
  return c;
});

function isOn(g: DrillGrade): boolean {
  return props.selected.includes(g);
}

// With nothing selected every segment burns full; otherwise the unpicked ones
// recede so the ring agrees with the list.
function dimmed(g: DrillGrade): boolean {
  return props.selected.length > 0 && !isOn(g);
}

const visible = computed(() =>
  props.selected.length
    ? props.results.filter((r) => props.selected.includes(r.grade))
    : props.results,
);

const filterLabel = computed(() => {
  if (!props.selected.length) return "This session";
  const picked = GRADE_ORDER.filter(isOn).map((g) =>
    GRADE_LABEL[g].toLowerCase(),
  );
  return `This session · ${picked.join(" · ")}`;
});

// Nothing selected replays the whole session; a selection replays exactly what
// is listed. The unfiltered label carries no count — naming one would read as a
// subset of the 20 words on screen.
const replayTargets = computed(() => visible.value);
const replayLabel = computed(() =>
  props.selected.length
    ? `Practice these ${replayTargets.value.length} again ✦`
    : "Practice Again ✦",
);

// Ring geometry: r=46 in a 120 box. Segments are laid incorrect → close →
// correct so the largest arc tends to read left, and a gap keeps neighbours
// legible where they meet.
const RING_CIRC = 2 * Math.PI * 46;
const RING_GAP = 6;
const ringSegments = computed(() => {
  const total = props.results.length;
  if (!total) return [];
  const present = ([...GRADE_ORDER] as DrillGrade[])
    .reverse()
    .filter((g) => counts.value[g] > 0);
  const gap = present.length > 1 ? RING_GAP : 0;
  let acc = 0;
  return present.map((grade) => {
    const len = (counts.value[grade] / total) * RING_CIRC;
    const seg = {
      grade,
      dasharray: `${Math.max(1, len - gap)} ${RING_CIRC}`,
      dashoffset: -(acc + gap / 2),
    };
    acc += len;
    return seg;
  });
});
</script>

<style scoped lang="sass">
.sum
  flex: 1
  min-height: 0
  align-self: stretch
  gap: 10px

.sum__head
  gap: 14px
  padding: 16px 14px
  animation: sum-bloom 0.7s cubic-bezier(0.2, 0.8, 0.3, 1) both

@keyframes sum-bloom
  0%
    transform: scale(0.94)
    opacity: 0
  100%
    transform: scale(1)
    opacity: 1

.sum__ring
  position: relative
  flex: 0 0 124px
  width: 124px
  height: 124px
  display: grid
  place-items: center

.sum__svg
  width: 100%
  height: 100%
  overflow: visible

.sum__track
  fill: none
  stroke: rgba(255, 255, 255, 0.06)
  stroke-width: 11

.sum__seg
  filter: drop-shadow(0 0 6px currentColor)
  transition: opacity 0.25s ease, filter 0.25s ease

.sum__seg--dim
  opacity: 0.22
  filter: none

.sum__center
  position: absolute
  display: flex
  flex-direction: column
  align-items: center
  line-height: 1

.sum__count
  font-size: 36px
  font-weight: 700
  font-variant-numeric: tabular-nums

.sum__unit
  font-size: 10px
  letter-spacing: 0.16em
  text-transform: uppercase
  color: var(--hotaru-sage)
  margin-top: 4px

.sum__tallies
  gap: 7px
  min-width: 0

.sum__tally
  gap: 8px
  width: 100%
  padding: 8px 10px
  border-radius: 12px
  cursor: pointer
  background: rgba(255, 255, 255, 0.035)
  border: 1px solid transparent
  color: var(--hotaru-cream-soft)
  font-size: 12px
  font-family: inherit
  text-align: left
  transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, color 0.18s ease

  &:hover
    background: rgba(255, 255, 255, 0.07)

.sum__pip
  width: 9px
  height: 9px
  border-radius: 50%
  flex: 0 0 9px

.sum__n
  font-size: 15px
  font-variant-numeric: tabular-nums
  color: var(--hotaru-cream)

.sum__tally--correct .sum__pip
  background: var(--hotaru-bamboo)
  box-shadow: 0 0 10px var(--hotaru-bamboo)

.sum__tally--close .sum__pip
  background: var(--hotaru-amber-private)
  box-shadow: 0 0 10px var(--hotaru-amber-private)

.sum__tally--incorrect .sum__pip
  background: var(--hotaru-fam-5)
  box-shadow: 0 0 10px var(--hotaru-fam-5)

// Selected tallies borrow the grade buttons' neon-edge language.
.sum__tally--on
  background: rgba(255, 255, 255, 0.07)

.sum__tally--correct.sum__tally--on
  border-color: rgba(56, 240, 230, 0.6)
  box-shadow: 0 0 22px rgba(56, 240, 230, 0.22)
  color: var(--hotaru-bamboo)

.sum__tally--close.sum__tally--on
  border-color: rgba(255, 206, 92, 0.6)
  box-shadow: 0 0 22px rgba(255, 206, 92, 0.22)
  color: var(--hotaru-amber-private)

.sum__tally--incorrect.sum__tally--on
  border-color: rgba(255, 92, 200, 0.55)
  box-shadow: 0 0 22px rgba(255, 92, 200, 0.2)
  color: var(--hotaru-fam-5)

.sum__fline
  font-size: 11px
  letter-spacing: 0.1em
  text-transform: uppercase
  color: var(--hotaru-sage)
  padding: 0 4px

.sum__clear
  background: none
  border: none
  cursor: pointer
  font-family: inherit
  font-size: 12px
  letter-spacing: 0.02em
  text-transform: none
  color: var(--hotaru-bamboo)

.sum__list
  min-height: 0
  overflow-y: auto
  padding: 2px 14px
  text-align: left

.sum__row
  gap: 10px
  padding: 11px 2px
  border-bottom: 1px solid rgba(155, 107, 255, 0.16)

  &:last-child
    border-bottom: none

.sum__word
  min-width: 0

.sum__jp
  font-size: 21px
  line-height: 1.15
  color: var(--hotaru-bamboo)
  text-shadow: 0 0 12px rgba(56, 240, 230, 0.4)

.sum__jp--kana
  color: #ffd24a
  text-shadow: 0 0 12px rgba(255, 210, 74, 0.4)

.sum__reading
  font-size: 12px
  color: #ffd24a
  opacity: 0.85
  margin-top: 1px

.sum__meaning
  font-size: 12px
  color: var(--hotaru-cream-soft)
  margin-top: 2px
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap

.sum__grade
  flex: 0 0 auto
  font-size: 10px
  font-weight: 600
  letter-spacing: 0.08em
  text-transform: uppercase
  padding: 4px 9px
  border-radius: 999px
  white-space: nowrap

.sum__grade--correct
  color: var(--hotaru-bamboo)
  border: 1px solid rgba(56, 240, 230, 0.5)
  background: rgba(56, 240, 230, 0.08)

.sum__grade--close
  color: var(--hotaru-amber-private)
  border: 1px solid rgba(255, 206, 92, 0.55)
  background: rgba(255, 206, 92, 0.08)

.sum__grade--incorrect
  color: var(--hotaru-fam-5)
  border: 1px solid rgba(255, 92, 200, 0.5)
  background: rgba(255, 92, 200, 0.08)

.sum__actions
  gap: 9px
  padding-top: 2px

@media (prefers-reduced-motion: reduce)
  .sum__head
    animation: none
</style>
