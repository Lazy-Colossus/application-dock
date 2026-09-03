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
    <!-- Reserved in EVERY cell, so the date sits on the same line right across
         the month whether or not a day is crowned. -->
    <span class="crown-slot" aria-hidden="true">
      <svg
        v-if="chosen"
        class="crown"
        viewBox="0 0 24 24"
        width="11"
        height="11"
      >
        <path d="M5 19h14l1.6-10-5.3 3.7L12 4 8.7 12.7 3.4 9z" />
      </svg>
    </span>
    <span class="d">{{ dayOfMonth }}</span>
    <span class="n" data-testid="count-area">
      <span data-testid="count">{{ coverage }}</span>
      <!-- Hover only, for now: a phone has no hover, and the day sheet already
           carries this list one tap away. A touch equivalent is deliberately
           left open rather than faked with a long-press that would fight the
           tap that opens the sheet. -->
      <q-tooltip
        v-if="voters.length > 0"
        class="kdh-panel kdh-voters"
        anchor="top middle"
        self="bottom middle"
        :offset="[0, 6]"
        :delay="120"
      >
        <div
          v-for="voter in voters"
          :key="voter.invitee.id"
          class="kdh-voter"
          :class="{ tentative: voter.status === 'if_needed' }"
        >
          <span
            class="kdh-voter-dot"
            :style="{ background: voter.invitee.color }"
          />
          {{ voter.invitee.name
          }}<span v-if="voter.status === 'if_needed'"> — if needed</span>
        </div>
      </q-tooltip>
    </span>

    <!-- Wide layout only (hidden by CSS below the breakpoint): a phone cell is
         ~44px and cannot hold a name, which is why the day sheet exists. Given
         room, the names belong here — this is what FR-13 originally asked for. -->
    <span v-if="voters.length > 0" class="cell-names" data-testid="cell-names">
      <template v-for="(voter, i) in shownVoters" :key="voter.invitee.id">
        <span v-if="i > 0">, </span
        ><span :class="{ tentative: voter.status === 'if_needed' }">{{
          voter.invitee.name
        }}</span> </template
      ><span v-if="voters.length > NAMES_SHOWN">…</span>
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { washFor } from "@/apps/kdh/composables/useWashScale";
import type { Invitee, VoteStatus } from "@/apps/kdh/types";

const props = defineProps<{
  /** YYYY-MM-DD. */
  date: string;
  /** invitee id -> status, for this date only. */
  votes: Record<string, VoteStatus>;
  activeTotal: number;
  /** The full roster, tombstones included — a past day may hold their vote. */
  invitees: Invitee[];
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

/** About as many names as a wide cell holds before it stops being scannable. */
const NAMES_SHOWN = 6;

/** Who is on this day, in roster order — the same list the day sheet shows. */
const voters = computed(() =>
  [...props.invitees]
    .filter((i) => props.votes[i.id] !== undefined)
    .sort((a, b) => a.order - b.order)
    .map((invitee) => ({ invitee, status: props.votes[invitee.id] })),
);

/**
 * Spoken as date, then coverage, then state — so the grid is usable without
 * seeing the wash at all (EXPERIENCE.md, Accessibility Floor).
 */
const shownVoters = computed(() => voters.value.slice(0, NAMES_SHOWN));

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
  /* Without this a flex/grid item refuses to shrink below its content, which
     is the other half of the uneven-column bug. */
  min-width: 0;
  overflow: hidden;
  border: none;
  border-radius: 7px;
  background: var(--kdh-wash-0);
  color: #cfc5de;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  cursor: pointer;
  padding: 0;
}
.kdh-cell:disabled {
  cursor: default;
}
.d {
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
/* The count sits in a target of its own: the number alone is a ~7px-wide thing
   to aim at, which is not a hover target. Padding widens it without changing
   where the number sits, and the highlight says it is worth pointing at. */
.n {
  position: relative;
  margin-top: 1px;
  padding: 2px 7px;
  min-width: 22px;
  border-radius: 5px;
  font-size: 11.5px;
  line-height: 1;
  color: #8a7da2;
  font-variant-numeric: tabular-nums;
  transition: background-color 0.12s ease;
}
.n:hover {
  background: rgba(235, 228, 244, 0.14);
}
/* White on pale lilac is invisible; darken instead at the top of the ramp. */
.w5 .n:hover,
.w6 .n:hover {
  background: rgba(26, 16, 36, 0.14);
}
@media (prefers-reduced-motion: reduce) {
  .n {
    transition: none;
  }
}

/* --- Names in the cell: wide layout only ------------------------------- */
.cell-names {
  display: none;
}

@media (min-width: 1024px) {
  .kdh-cell {
    /* Height comes from the grid, not from the width — a cell now has to hold
       six names, and an aspect ratio would either clip them or leave a crater
       on an empty day. */
    aspect-ratio: auto;
    justify-content: flex-start;
    padding: 8px 6px;
  }
  .crown-slot {
    height: 16px;
  }
  .crown {
    width: 16px;
    height: 16px;
  }
  .d {
    font-size: 26px;
  }
  /* Generous on web because this is where hover exists at all, and the number
     alone was too small to aim at. Untouched on a phone, which has no hover and
     no room. */
  .n {
    font-size: 17px;
    padding: 8px 20px;
    min-width: 58px;
    border-radius: 8px;
  }
  /* One line at the foot of the cell, in the cell's own ink. Deliberately NOT
     each person's colour: six colours on one line is a smear, and the colour
     already does its work in the day sheet and the hover list. */
  .cell-names {
    /* Wraps to a second line and is then clipped, rather than running on and
       dragging the column wider. */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-clamp: 2;
    margin-top: auto;
    padding-top: 6px;
    width: 100%;
    max-width: 100%;
    font-size: 11px;
    line-height: 1.3;
    text-align: center;
    opacity: 0.85;
    white-space: normal;
    overflow-wrap: anywhere;
    overflow: hidden;
  }
  /* Still set apart by style rather than colour, which is what NFR-6 asks for. */
  .tentative {
    font-style: italic;
    opacity: 0.75;
  }
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

/* The decided day.
   A gold ring and outer glow on the cell, so it pops at EVERY step of the ramp —
   including the pale top, where gold text alone disappears and where the chosen
   day most often lives. The date is bold gold with its own glow on the dark
   steps; on the light ones it drops to the deep gold and loses the text glow,
   because a bright halo on pale lilac is mud. The diamond stays regardless: gold
   carries the message, but colour must never be the only signal (NFR-6). */
.chosen {
  /* Above its neighbours: grid siblings paint in document order, so without
     this the glow is covered by the backgrounds of every later cell. */
  z-index: 1;
  box-shadow:
    0 0 0 1.5px var(--kdh-gold),
    0 0 12px var(--kdh-gold-glow);
}
.chosen .d {
  font-weight: 700;
  color: var(--kdh-gold);
  text-shadow:
    0 0 6px var(--kdh-gold-glow),
    0 0 14px var(--kdh-gold-glow);
}
/* The pale top of the ramp. The gold stays bright — it is the same mark
   everywhere — and legibility comes from a dark halo behind it instead of from
   darkening the colour. Bright gold on pale lilac does not reach 4.5:1 on its
   own; the halo is what carries it, and the diamond plus the cell's ring remain
   as signals that do not depend on colour at all (NFR-6). */
.w5.chosen .d,
.w6.chosen .d {
  color: var(--kdh-gold);
  text-shadow:
    0 1px 2px rgba(26, 16, 36, 0.95),
    0 0 7px rgba(26, 16, 36, 0.8),
    0 0 14px rgba(26, 16, 36, 0.5);
}
/* Both marks at once: the provisional hairline is inset, the chosen ring is
   outside it, so they compose rather than one silently winning. */
.chosen.provisional {
  box-shadow:
    inset 0 0 0 1px var(--kdh-wash-6),
    0 0 0 1.5px var(--kdh-gold),
    0 0 12px var(--kdh-gold-glow);
}
/* The slot has a fixed height in every cell, crowned or not — that is what keeps
   the date on one line across the whole month. */
.crown-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 11px;
  margin-bottom: 1px;
  line-height: 0;
}
/* Filled gold with a dark stroke, so one crown reads at every step of the ramp —
   the same trick the gold date uses, rather than a second darker crown for the
   pale steps. It is also the signal that does not depend on colour (NFR-6). */
.crown {
  fill: var(--kdh-gold);
  stroke: rgba(26, 16, 36, 0.85);
  stroke-width: 1.4;
  stroke-linejoin: round;
  paint-order: stroke fill;
  filter: drop-shadow(0 0 4px var(--kdh-gold-glow));
}
.w5 .crown,
.w6 .crown {
  filter: none;
}
</style>
