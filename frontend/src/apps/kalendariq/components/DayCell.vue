<template>
  <button
    class="kalendariq-cell"
    :class="[
      `w${wash.step}`,
      { past, today, chosen, selected, provisional: wash.provisional },
    ]"
    :aria-label="label"
    :data-testid="`day-${date}`"
    @click="onClick"
  >
    <!-- Reserved in EVERY cell, so the date sits on the same line right across
         the month whether or not a day is crowned. -->
    <!-- Your own answer, in the cell's own leading corner. It is the one
         personal fact in a cell of group facts (the wash, the count, the crown),
         so it gets a corner nothing else ever uses — which is what makes a month
         scannable for "days I said yes to" without reading a single number.
         Anchored to the cell rather than to the crown slot: the slot is a
         centred flex row that carries no in-flow content on an uncrowned day,
         and a mark hung off it drifts toward the middle when its width does not
         resolve. The cell's own box cannot drift. -->
    <span
      v-if="mine"
      class="mine-mark"
      :class="mine === 'yes' ? 'free' : 'maybe'"
      aria-hidden="true"
    />

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
      <!-- Wide layout only (hidden by CSS below the breakpoint, like the names):
           says what the number counts, which a bare digit next to a date does
           not. Suppressed at zero — an icon for nobody is noise, and the empty
           days are the ones the eye should skip. -->
      <svg
        v-if="coverage > 0"
        class="who"
        viewBox="0 0 24 24"
        aria-hidden="true"
        data-testid="count-icon"
      >
        <path
          d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 1.8c-4.2 0-7.6 2.1-7.6 4.7V20h15.2v-1.5c0-2.6-3.4-4.7-7.6-4.7Z"
        />
      </svg>
      <span data-testid="count">{{ coverage }}</span>
      <!-- Hover only: a phone has no hover, and the day sheet already carries
           this list one tap away. A touch equivalent is deliberately left open
           rather than faked with a long-press that would fight the tap that
           opens the sheet. The `.n` rule below keeps this out of the way of
           that tap — without it Quasar wires touch handlers here and the tap
           dies on the number. -->
      <q-tooltip
        v-if="voters.length > 0"
        class="kalendariq-panel kalendariq-voters"
        anchor="top middle"
        self="bottom middle"
        :offset="[0, 6]"
        :delay="120"
      >
        <div
          v-for="voter in voters"
          :key="voter.invitee.id"
          class="kalendariq-voter"
          :class="{ tentative: voter.status === 'if_needed' }"
        >
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
import { washFor } from "@/apps/kalendariq/composables/useWashScale";
import type { Invitee, VoteStatus } from "@/apps/kalendariq/types";

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
  selected: boolean;
  /** Whoever is looking, so the cell can show their own answer back to them. */
  claimedId: string | null;
}>();

const emit = defineEmits<{ pick: [date: string] }>();

/**
 * A past day is inert to the click but NOT disabled: `disabled` suppresses
 * pointer events on a button's children in every browser, which would take the
 * hover list of who was there with it — and that list is the reason a past day
 * is still worth looking at.
 */
function onClick(): void {
  if (props.past) return;
  emit("pick", props.date);
}

const dayOfMonth = computed(() => Number(props.date.slice(8, 10)));

/**
 * Only ever `yes` or `if_needed`: a "can't" is stored as no vote at all, so a
 * deliberate no and an unanswered day are the same absence here. The mark reads
 * as "days I said yes to", not "days I answered".
 */
const mine = computed(() =>
  props.claimedId ? props.votes[props.claimedId] : undefined,
);
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
  if (mine.value)
    parts.push(mine.value === "yes" ? "you are free" : "you if needed");
  if (props.chosen) parts.push("chosen");
  if (props.past) parts.push("past");
  if (props.today) parts.push("today");
  return parts.join(", ");
});
</script>

<style scoped>
.kalendariq-cell {
  position: relative;
  aspect-ratio: 1 / 1.06;
  width: 100%;
  /* Without this a flex/grid item refuses to shrink below its content, which
     is the other half of the uneven-column bug. */
  min-width: 0;
  overflow: hidden;
  border: none;
  border-radius: 7px;
  background: var(--kalendariq-wash-0);
  color: #cfc5de;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  cursor: pointer;
  padding: 0;
}
.kalendariq-cell:disabled,
.kalendariq-cell.past {
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
/* The count is a hover target, and on a touch screen it was a dead spot: Quasar
   binds the tooltip's touch handlers to this element, so a tap that landed on
   the number opened nothing and selected nothing — and on a ~44px cell the
   number is most of what there is to aim at. Transparent to the pointer where
   there is no hover, so the whole cell is one target again. */
@media (hover: none) {
  .n {
    pointer-events: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .n {
    transition: none;
  }
}

/* --- Names and the count icon: wide layout only ----------------------- */
.cell-names,
.who {
  display: none;
}

@media (min-width: 700px) {
  .kalendariq-cell {
    aspect-ratio: 1 / 1;
    justify-content: flex-start;
    padding: 6px 5px;
  }
  .chosen {
    box-shadow: 0 0 0 2.5px var(--kalendariq-gold);
  }
  .chosen.provisional {
    box-shadow:
      inset 0 0 0 1px var(--kalendariq-wash-6),
      0 0 0 2.5px var(--kalendariq-gold);
  }
  /* Fluid between the breakpoint and the cap: at 700px a square cell is only
     ~89px tall, and fixed sizes would push the names straight back out of it.
     Every piece scales with the viewport and stops at the size chosen for a
     comfortable window. */
  /* Outranks the base rule below, which would otherwise win on source order
     alone and pin the slot to its phone height while the crown inside it grew. */
  .kalendariq-cell .crown-slot {
    height: clamp(10px, 1.1vw, 14px);
  }
  .crown {
    width: clamp(10px, 1.1vw, 14px);
    height: clamp(10px, 1.1vw, 14px);
  }
  .d {
    font-size: clamp(20px, 1.9vw, 25px);
  }
  /* Generous on web because this is where hover exists at all, and the number
     alone was too small to aim at. Untouched on a phone, which has no hover and
     no room. */
  .n {
    font-size: clamp(12px, 1.1vw, 14px);
    padding: 4px clamp(9px, 1.1vw, 15px);
    min-width: clamp(34px, 3.4vw, 46px);
    border-radius: 8px;
  }
  /* Sized in `em` and filled with `currentColor`, so it rides the count's own
     fluid font size and inherits the per-step ink that already keeps the number
     legible at the pale top of the ramp — no second set of colour rules. */
  .who {
    display: inline-block;
    width: 1em;
    height: 1em;
    margin-right: 0.28em;
    vertical-align: -0.14em;
    fill: currentColor;
    opacity: 0.85;
  }
  /* One line at the foot of the cell, in the cell's own ink. Deliberately NOT
     each person's colour: six colours on one line is a smear, and the colour
     already does its work in the day sheet and the hover list. */
  /* Sits directly under the count rather than at the foot of the cell.
     `margin-top: auto` pushed it against the bottom edge of a square that is
     already close to full, which is how it ended up spilling out. Two lines
     tall, clipped, and allowed to shrink on a narrow window. */
  .cell-names {
    /* Two lines, and the browser adds its own ellipsis at the cut — so a day
       whose names do not fit says so, rather than ending mid-word. The clamp
       replaces `max-height`: it truncates at a line boundary and marks it,
       where a height limit only ever cropped in silence.

       This is separate from the explicit "…" appended past the sixth name.
       That one means "more people are on this day"; this one means "more text
       than fits". They rarely both show, and when they do the clamp's is the
       one you see. */
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    flex: 0 1 auto;
    min-height: 0;
    /* Set the names apart from the count as their own block, rather than
       reading as one more line of it. */
    margin-top: 9px;
    width: 100%;
    max-width: 100%;
    font-size: clamp(8.5px, 0.75vw, 10px);
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
  background: var(--kalendariq-wash-1);
}
.w2 {
  background: var(--kalendariq-wash-2);
}
.w3 {
  background: var(--kalendariq-wash-3);
}
.w4 {
  background: var(--kalendariq-wash-4);
}
.w5 {
  background: var(--kalendariq-wash-5);
}
.w6 {
  background: var(--kalendariq-wash-6);
}

/* The field is light enough at the top of the ramp that pale text fails. */
.w5,
.w6 {
  color: var(--kalendariq-ink-on-light);
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
  box-shadow: inset 0 0 0 1px var(--kalendariq-wash-6);
}
.today {
  outline: 2px solid var(--kalendariq-ink-mid);
  outline-offset: -2px;
}
/* Collected for a bulk answer. A fill rather than a frame, so it cannot be
   mistaken for the gold frame that means "this is the day". */
.selected {
  box-shadow: inset 0 0 0 2px var(--kalendariq-wash-5);
}
/* Trailing corner, because the leading one belongs to your own answer and the
   two would otherwise sit on top of each other in select mode. */
.selected::before {
  content: "✓";
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 9px;
  color: var(--kalendariq-wash-6);
}
.past {
  opacity: 0.3;
}

/* The decided day.
   A gold ring on the cell, so it pops at EVERY step of the ramp — including the
   pale top, where the chosen day most often lives. The date is bold in the ring's
   own gold at every step: one gold for one meaning, so the number and the frame
   are visibly the same mark rather than two golds a step apart — and the crown
   above them is that same gold again. That costs contrast on the two palest
   washes, where the ring carries the day. The crown stays regardless: gold
   carries the message, but colour must never be the only signal (NFR-6). */
/* The mark lives in the gutter, not on the cell. A frame looks identical at
   every step of the ramp, which is what nothing painted on the wash could do —
   and because the frame carries the message, the number no longer has to. */
.chosen {
  /* Above its neighbours: grid siblings paint in document order, so without
     this the frame is covered by the backgrounds of every later cell. */
  z-index: 1;
  /* Sized to the gutter it sits in: 2px of a 4px phone gap, 2.5px of a 6px web
     one. Any thicker and the frame touches its neighbour. */
  box-shadow: 0 0 0 2px var(--kalendariq-gold);
}
.chosen .d {
  font-weight: 700;
  color: var(--kalendariq-gold);
}
/* Both marks at once: the provisional hairline is inset, the chosen ring is
   outside it, so they compose rather than one silently winning. */
.chosen.provisional {
  box-shadow:
    inset 0 0 0 1px var(--kalendariq-wash-6),
    0 0 0 2px var(--kalendariq-gold);
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
/* Your own answer, folded into the leading corner like a dog-eared page.
   Flush to the corner rather than inset: the two straight legs then sit on the
   cell's own boundary, where the wash meets the dark field, and that edge is
   the one thing in the cell whose contrast does not change as the ramp climbs.
   The cell's `overflow: hidden` and 7px radius round the point for free.
   Costs no layout at all, so the date, the crown slot and the count keep the
   sizes they were designed at — and it stays clear of the crown, which is
   centred, and of the select-mode tick, which owns the trailing corner.
   One rule for both layouts: below ~820px the viewport term is under the floor,
   so a phone gets a flat 14px and a wide window grows it with everything else. */
.mine-mark {
  position: absolute;
  top: 0;
  left: 0;
  width: clamp(14px, 1.8vw, 26px);
  height: clamp(14px, 1.8vw, 26px);
  clip-path: polygon(0 0, 100% 0, 0 100%);
}
.mine-mark.free {
  background: var(--kalendariq-yes);
}
/* Half the wedge, held at the corner — the same whole-versus-half language the
   day sheet's answer buttons and status glyphs already speak, and the signal
   that survives with the colour taken away (NFR-6). */
.mine-mark.maybe {
  background: linear-gradient(
    to bottom right,
    var(--kalendariq-maybe) 0 52%,
    transparent 52%
  );
}

/* One gold at every step of the ramp, the ring's own — no darker crown for the
   pale steps. Its shape is the signal that does not depend on colour (NFR-6),
   which is what lets the fill follow the ring rather than the background. */
.crown {
  fill: var(--kalendariq-gold);
}
</style>
