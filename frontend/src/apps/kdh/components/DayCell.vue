<template>
  <button
    class="kdh-cell"
    :class="[
      `w${wash.step}`,
      { past, today, chosen, provisional: wash.provisional },
    ]"
    :aria-label="label"
    :data-testid="`day-${date}`"
    @click="$emit('pick', date)"
  >
    <span class="d">{{ dayOfMonth }}</span>
    <span class="n">{{ coverage }}</span>
    <span v-if="chosen" class="chosen-mark" aria-hidden="true" />
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { washFor } from "@/apps/kdh/composables/useWashScale";
import type { VoteStatus } from "@/apps/kdh/types";

const props = defineProps<{
  /** YYYY-MM-DD. */
  date: string;
  /** invitee id -> status, for this date only. */
  votes: Record<string, VoteStatus>;
  activeTotal: number;
  chosen: boolean;
  past: boolean;
  today: boolean;
}>();

defineEmits<{ pick: [date: string] }>();

const dayOfMonth = computed(() => Number(props.date.slice(8, 10)));
const statuses = computed(() => Object.values(props.votes));
const free = computed(() => statuses.value.filter((s) => s === "yes").length);
const ifNeeded = computed(
  () => statuses.value.filter((s) => s === "if_needed").length,
);
const coverage = computed(() => statuses.value.length);
const wash = computed(() =>
  washFor(free.value, ifNeeded.value, props.activeTotal),
);

/**
 * Spoken as date, then coverage, then state — so the grid is usable without
 * seeing the wash at all (EXPERIENCE.md, Accessibility Floor).
 */
const label = computed(() => {
  const parts = [`${dayOfMonth.value}`];
  parts.push(
    coverage.value === 0
      ? "nobody free"
      : coverage.value === props.activeTotal
        ? wash.value.provisional
          ? "everyone, one only if needed"
          : "everyone free"
        : `${coverage.value} of ${props.activeTotal} free`,
  );
  if (props.chosen) parts.push("chosen");
  if (props.past) parts.push("past");
  if (props.today) parts.push("today");
  return parts.join(", ");
});
</script>

<style scoped>
.kdh-cell {
  position: relative;
  aspect-ratio: 1 / 1.06;
  width: 100%;
  border: none;
  border-radius: 7px;
  background: var(--kdh-wash-0);
  color: #cfc5de;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  cursor: pointer;
  padding: 0;
}
.kdh-cell:disabled {
  cursor: default;
}
.d {
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.n {
  font-size: 10px;
  line-height: 1;
  color: #8a7da2;
  font-variant-numeric: tabular-nums;
}

.w1 {
  background: var(--kdh-wash-1);
}
.w2 {
  background: var(--kdh-wash-2);
}
.w3 {
  background: var(--kdh-wash-3);
}
.w4 {
  background: var(--kdh-wash-4);
}
.w5 {
  background: var(--kdh-wash-5);
}
.w6 {
  background: var(--kdh-wash-6);
}

/* The field is light enough at the top of the ramp that pale text fails. */
.w5,
.w6 {
  color: var(--kdh-ink-on-light);
}
.w5 .n,
.w6 .n {
  color: #3f2b57;
}
.w4 .n {
  color: #c6b4dc;
}

/* Full coverage that leans on an if-needed: same step, visibly provisional. */
.provisional {
  box-shadow: inset 0 0 0 1px var(--kdh-wash-6);
}
.today {
  outline: 1px solid var(--kdh-ink-mid);
  outline-offset: -1px;
}
.past {
  opacity: 0.3;
}

/* The decided day. Gold and bold on the date itself, plus the diamond — the
   shape is what keeps the marking readable for someone who cannot see the
   colour, so it stays even though the gold now carries the message. */
.chosen .d {
  font-weight: 700;
  color: var(--kdh-gold);
}
.w5.chosen .d,
.w6.chosen .d {
  color: var(--kdh-gold-deep);
}
.chosen-mark {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 5px;
  height: 5px;
  background: var(--kdh-gold);
  transform: rotate(45deg);
}
.w5 .chosen-mark,
.w6 .chosen-mark {
  background: var(--kdh-gold-deep);
}
</style>
