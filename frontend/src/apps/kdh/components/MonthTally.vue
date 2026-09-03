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
      <span class="nm ellipsis">{{ row.invitee.name }}</span>
      <span v-if="row.invitee.id === claimedId" class="tag">YOU</span>
      <span v-if="row.invitee.removed_at" class="tag">LEFT</span>

      <!-- Nothing at all reads better as a sentence than as two zeroes: a person
           who has not voted is the one thing this summary exists to surface. -->
      <span v-if="row.total === 0" class="col counts" data-testid="none-yet"
        >nothing yet</span
      >
      <span v-else class="col counts">
        <span v-if="row.upcoming > 0" class="to-come"
          >{{ row.upcoming }} to come</span
        >
        <span v-if="row.upcoming > 0 && row.past > 0" class="sep">·</span>
        <span v-if="row.past > 0" class="past">{{ row.past }} past</span>
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
 * One line per person, in roster order.
 *
 * Today counts as still to come, the same as it does everywhere else — a day
 * you can still answer is not yet history.
 *
 * Someone who has left is listed only if they voted in this month: their past
 * votes are a record the grid already shows, but an empty row for a person no
 * longer in the group is just noise.
 */
const rows = computed(() => {
  const all = [...props.invitees].sort((a, b) => a.order - b.order);

  return all
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
    .filter((row) => !row.invitee.removed_at || row.total > 0);
});

const anyVotes = computed(() => rows.value.some((row) => row.total > 0));
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
.tally-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  padding: 3px 0;
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
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--kdh-ink-mid);
}
.to-come {
  color: var(--kdh-ink-hi);
}
.sep {
  margin: 0 4px;
  opacity: 0.5;
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
