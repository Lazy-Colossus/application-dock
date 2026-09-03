<template>
  <div class="kdh-tally" data-testid="month-tally">
    <div class="tally-h">Votes in {{ monthLabel }}</div>

    <!-- One sentence beats a column of "nothing yet": before anyone has voted,
         naming every person tells you nothing you cannot see in the empty grid
         above. The per-person rows earn their place only once there is a gap
         between people to notice. -->
    <div v-if="!anyVotes" class="tally-empty" data-testid="tally-empty">
      Nobody has voted this month yet.
    </div>

    <div
      v-for="row in rows"
      v-else
      :key="row.invitee.id"
      class="tally-row"
      :class="{ mine: row.invitee.id === claimedId, silent: row.total === 0 }"
      :data-testid="`tally-${row.invitee.id}`"
    >
      <span class="who">
        <span class="nm ellipsis">{{ row.invitee.name }}</span>
        <span v-if="row.invitee.id === claimedId" class="tag">YOU</span>
        <span v-if="row.invitee.removed_at" class="tag">LEFT</span>
      </span>

      <!-- Scaled against the busiest person, not against the days in the month:
           the question this answers is who has answered and who has not, and a
           bar that is 11/30 full of everything answers it worse than one that
           is 11/11 of the most anyone managed. Decorative — the number sits
           right beside it, so a screen reader gains nothing from the shape.

           Grow factors are strings because Vue drops a falsy style value, and a
           zero-length segment is exactly the case that has to survive. -->
      <span class="bar" aria-hidden="true" data-testid="bar">
        <i class="seg cur" :style="{ flexGrow: String(row.upcoming) }" />
        <i class="seg old" :style="{ flexGrow: String(row.past) }" />
        <i
          class="seg gap"
          :style="{ flexGrow: String(maxTotal - row.total) }"
        />
      </span>

      <!-- Nothing at all reads better as a sentence than as two zeroes: a person
           who has not voted is the one thing this summary exists to surface. -->
      <span v-if="row.total === 0" class="col counts" data-testid="none-yet"
        >nothing yet</span
      >
      <!-- The count, and behind it how much of it has already been and gone.
           Only in the month that straddles today: in a month gone by every vote
           is past and in a month ahead none is, so the bracket would restate
           the total or say nothing at all. -->
      <span v-else class="col counts">
        <b class="total">{{ row.total }}</b>
        <span v-if="isCurrentMonth && row.past > 0" class="split"
          >({{ row.past }} past)</span
        >
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Invitee, VoteStatus } from "@/apps/kdh/types";

const props = defineProps<{
  invitees: Invitee[];
  /** date -> invitee id -> status, for the whole calendar. */
  votes: Record<string, Record<string, VoteStatus>>;
  /** Every day of the month on screen, YYYY-MM-DD. */
  dates: string[];
  /** From the server, never the device's clock (NFR-5). */
  serverToday: string;
  claimedId: string | null;
  /** Named, not derived: the grid already owns which month is on screen. */
  monthLabel: string;
}>();

/**
 * One line per person, busiest first — which makes the bars a ranked chart
 * rather than a roster with decoration, and puts whoever has said nothing at
 * the bottom where the gap is easiest to see. Roster order breaks ties, so
 * equal counts never shuffle between renders.
 *
 * Today counts as still to come, the same as it does everywhere else — a day
 * you can still answer is not yet history.
 *
 * Someone who has left is listed only if they voted in this month: their past
 * votes are a record the grid already shows, but an empty row for a person no
 * longer in the group is just noise.
 */
const rows = computed(() =>
  [...props.invitees]
    .map((invitee) => {
      let upcoming = 0;
      let past = 0;
      for (const date of props.dates) {
        if (props.votes[date]?.[invitee.id] === undefined) continue;
        if (date < props.serverToday) past += 1;
        else upcoming += 1;
      }
      return { invitee, upcoming, past, total: upcoming + past };
    })
    .filter((row) => !row.invitee.removed_at || row.total > 0)
    .sort((a, b) => b.total - a.total || a.invitee.order - b.invitee.order),
);

const anyVotes = computed(() => rows.value.some((row) => row.total > 0));

/** The busiest person sets the scale; 1 keeps an untouched month from /0. */
const maxTotal = computed(() =>
  Math.max(1, ...rows.value.map((row) => row.total)),
);

/** Today falls inside the month on screen — the only month with two halves. */
const isCurrentMonth = computed(
  () => props.dates[0]?.slice(0, 7) === props.serverToday.slice(0, 7),
);
</script>

<style scoped>
.kdh-tally {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--kdh-field-raise);
  border: 1px solid var(--kdh-field-line);
  font-size: 13px;
}
.tally-h {
  margin-bottom: 6px;
  font-size: 11.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--kdh-ink-lo);
}
.tally-empty {
  color: var(--kdh-ink-mid);
}
/* Three tracks so the bars share one baseline and one scale down the column —
   a chart whose bars start in different places is not a chart. */
.tally-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(44px, 22%, 120px) auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 3px 0;
}
.who {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
.bar {
  display: flex;
  height: 7px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--kdh-wash-0);
}
.seg {
  display: block;
  min-width: 0;
}
.cur {
  background: var(--kdh-wash-4);
}
/* Already been and gone: the same bar, spent. */
.old {
  background: var(--kdh-wash-2);
}
.gap {
  background: transparent;
}
.nm {
  min-width: 0;
  color: var(--kdh-ink-hi);
}
/* Nobody has answered, which is the thing worth noticing here — so it is the
   one row that is quieter, not louder. Shouting at people is not this app's
   job; the gap in the column is enough to see. */
.silent .nm,
.silent .counts {
  color: var(--kdh-ink-lo);
}
.counts {
  justify-self: end;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--kdh-ink-mid);
}
.total {
  color: var(--kdh-ink-hi);
  font-weight: 600;
}
/* The bracket explains the total rather than competing with it. */
.split {
  margin-left: 5px;
  font-size: 12px;
  opacity: 0.8;
}
.tag {
  flex: none;
  padding: 0 5px;
  border-radius: 4px;
  background: var(--kdh-wash-2);
  color: var(--kdh-ink-mid);
  font-size: 9.5px;
  letter-spacing: 0.06em;
}
.mine .nm {
  font-weight: 600;
}
</style>
