<template>
  <div class="kalendariq-month">
    <div class="kalendariq-month-head q-mb-sm">
      <div class="row items-center kalendariq-month-nav">
        <q-btn
          flat
          dense
          round
          size="sm"
          icon="chevron_left"
          aria-label="Previous month"
          data-testid="prev-month"
          @click="shift(-1)"
        />
        <div class="kalendariq-month-label" data-testid="month-label">
          {{ monthLabel }}
        </div>
        <q-btn
          flat
          dense
          round
          size="sm"
          icon="chevron_right"
          aria-label="Next month"
          data-testid="next-month"
          @click="shift(1)"
        />
      </div>
      <!-- Outside the arrow cluster, never between the arrows. It is
           conditional, and inside the cluster it reflowed the chevrons on the
           very click that summoned it: one step off the current month moved
           `next-month` out from under the pointer, and the second click of a
           two-month jump landed on the wrong control. The label between the
           arrows is width-reserved for the same reason -- a label that resized
           with the month name would slide `next-month` sideways on every step.
           The grid below puts this beside the month on a wide header and on its
           own second line on a phone, where all three do not fit. -->
      <button
        v-if="!showingCurrentMonth"
        class="kalendariq-today-btn"
        data-testid="jump-today"
        @click="goToToday"
      >
        Today
      </button>
      <!-- Only on the way in: leaving is the Cancel on the selection bar, and
           two ways out of one mode is one too many. -->
      <button
        v-if="selectable && !selectMode"
        class="kalendariq-select-btn"
        data-testid="select-toggle"
        @click="$emit('toggleSelectMode')"
      >
        <q-icon name="checklist" size="16px" />Select Multiple
      </button>
    </div>

    <div class="kalendariq-dow">
      <div v-for="(d, i) in WEEKDAYS" :key="i">{{ d }}</div>
    </div>

    <div class="kalendariq-grid">
      <div v-for="blank in leadingBlanks" :key="`b${blank}`" />
      <DayCell
        v-for="date in dates"
        :key="date"
        :date="date"
        :votes="votes[date] ?? {}"
        :active-total="activeTotal"
        :invitees="invitees"
        :chosen="chosenDates.includes(date)"
        :past="date < serverToday"
        :selected="selected.has(date)"
        :claimed-id="claimedId"
        :today="date === serverToday"
        @pick="$emit('pick', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import DayCell from "./DayCell.vue";
import type { Invitee, VoteStatus } from "@/apps/kalendariq/types";

const props = defineProps<{
  votes: Record<string, Record<string, VoteStatus>>;
  chosenDates: string[];
  activeTotal: number;
  invitees: Invitee[];
  /** YYYY-MM-DD from the server — never the device's clock (NFR-5). */
  serverToday: string;
  /** Only someone who has claimed a name can answer, so only they can bulk-answer. */
  selectable: boolean;
  selectMode: boolean;
  selected: Set<string>;
  claimedId: string | null;
}>();

defineEmits<{ pick: [date: string]; toggleSelectMode: [] }>();

// Monday first: this is a European group, and a weekend that straddles the
// grid's edge makes "are we free on Saturday" harder to read than it should be.
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const cursor = ref({
  year: Number(props.serverToday.slice(0, 4)),
  month: Number(props.serverToday.slice(5, 7)) - 1,
});

const monthLabel = computed(
  () => `${MONTHS[cursor.value.month]} ${cursor.value.year}`,
);

const showingCurrentMonth = computed(
  () =>
    cursor.value.year === Number(props.serverToday.slice(0, 4)) &&
    cursor.value.month === Number(props.serverToday.slice(5, 7)) - 1,
);

/** Blank cells before the 1st, with Monday as column 0. */
const leadingBlanks = computed(() => {
  const firstDay = new Date(cursor.value.year, cursor.value.month, 1).getDay();
  // `getDay()` is Sunday-first; shift it so Monday is 0.
  return (firstDay + 6) % 7;
});

const dates = computed(() => {
  const { year, month } = cursor.value;
  const days = new Date(year, month + 1, 0).getDate();
  const mm = String(month + 1).padStart(2, "0");
  return Array.from(
    { length: days },
    (_, i) => `${year}-${mm}-${String(i + 1).padStart(2, "0")}`,
  );
});

/** Arrows only — a swipe over a grid of tap targets is too easily triggered. */
function shift(by: number): void {
  const next = new Date(cursor.value.year, cursor.value.month + by, 1);
  cursor.value = { year: next.getFullYear(), month: next.getMonth() };
}

function goToToday(): void {
  cursor.value = {
    year: Number(props.serverToday.slice(0, 4)),
    month: Number(props.serverToday.slice(5, 7)) - 1,
  };
}

/** The page needs both to offer "clear my answers for <month>". */
defineExpose({ monthLabel, dates });
</script>

<style scoped>
/* The invitee's main road into the app, so it looks like a button rather than
   another piece of month furniture. */
.kalendariq-select-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  padding: 6px 12px;
  border: none;
  border-radius: 999px;
  background: var(--kalendariq-wash-4);
  color: var(--kalendariq-ink-hi);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
.kalendariq-select-btn:hover {
  background: var(--kalendariq-wash-5);
  color: var(--kalendariq-ink-on-light);
}
/* Explicit rows rather than flex wrapping: the header's children are content
   sized, so a wrap would never fall where it is wanted -- the cluster just grew
   and pushed Select Multiple down instead. Phone gets two rows, with Today on
   the second; the wide layout below collapses them into one. */
.kalendariq-month-head {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  row-gap: 6px;
}
.kalendariq-month-nav {
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
  gap: 2px;
}
.kalendariq-month-head > .kalendariq-select-btn {
  grid-column: 2;
  grid-row: 1;
  justify-self: end;
}
/* Row 2 exists only when Today does, so an empty row never opens a gap. */
.kalendariq-month-head > .kalendariq-today-btn {
  grid-column: 1 / -1;
  grid-row: 2;
  justify-self: start;
}
.kalendariq-today-btn {
  /* Never shrinks: the month label is what gives way on a narrow header,
     because a truncated month name still reads and a truncated button does
     not. */
  flex: none;
  padding: 5px 12px;
  border: 1px solid var(--kalendariq-field-line);
  border-radius: 999px;
  background: transparent;
  color: var(--kalendariq-ink-mid);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background-color 0.12s ease;
}
.kalendariq-today-btn:hover {
  background: var(--kalendariq-wash-3);
  border-color: var(--kalendariq-wash-4);
  color: var(--kalendariq-ink-hi);
}
.kalendariq-today-btn:focus-visible {
  outline: 2px solid var(--kalendariq-wash-5);
  outline-offset: 1px;
}
@media (prefers-reduced-motion: reduce) {
  .kalendariq-today-btn {
    transition: none;
  }
}
.kalendariq-month-label {
  /* Reserved footprint, wide enough for the longest label ("September 2026"):
     the arrows flank the label now, so a label that grew with the month name
     would walk `next-month` sideways on every step. In em, so the reservation
     tracks the font size at both breakpoints. */
  flex: none;
  min-width: 11.5em;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--kalendariq-ink-mid);
}
.kalendariq-dow,
.kalendariq-grid {
  display: grid;
  /* `minmax(0, 1fr)` and not `1fr`: a `1fr` track has an AUTO minimum, so any
     cell whose content is wider than its share silently widens its whole
     column and the seven stop being equal. */
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: var(--gap);

  /* The weekend band. It is painted BEHIND the cells, so it shows only in the
     gutters and the padding — different paper under the last two columns, never
     a change to any cell. That is the whole point: the wash is the only thing
     allowed to tint a cell, so a weekend signal that touched one would read as
     votes. Cells are opaque, so this cannot leak into them. */
  --gap: 4px;
  --weekend-edge: calc(
    (100% - 8px - 6 * var(--gap)) / 7 * 5 + 4.5 * var(--gap) + 4px
  );
  padding: 4px;
  background: linear-gradient(
    to right,
    transparent 0 var(--weekend-edge),
    rgba(167, 155, 188, 0.1) var(--weekend-edge) 100%
  );
  border-radius: 8px;
}
.kalendariq-dow {
  padding-bottom: 2px;
}
.kalendariq-dow {
  font-size: 9.5px;
  letter-spacing: 0.06em;
  text-align: center;
  color: var(--kalendariq-ink-lo);
  margin-bottom: 4px;
}

@media (min-width: 700px) {
  .kalendariq-month-label {
    font-size: 16px;
  }
  /* Scales with the month label beside it: at 12.5px this read as a caption on
     a wide header rather than the way into select mode. */
  .kalendariq-select-btn {
    padding-bottom: 9px;
    padding-right: 30px;
    padding-left: 30px;
    font-size: 15px;
  }
  .kalendariq-select-btn .q-icon {
    font-size: 22px;
  }
  /* Room for all three on one line again: Today returns beside the month. */
  .kalendariq-month-head {
    grid-template-columns: auto auto 1fr;
  }
  .kalendariq-month-head > .kalendariq-today-btn {
    grid-column: 2;
    grid-row: 1;
    margin-left: 8px;
  }
  .kalendariq-month-head > .kalendariq-select-btn {
    grid-column: 3;
  }
  .kalendariq-dow {
    font-size: 12px;
    margin-bottom: 6px;
  }
  .kalendariq-dow,
  .kalendariq-grid {
    --gap: 6px;
  }
  /* Square cells govern their own height now, so the rows follow the columns
     and every box is the same shape. */
  .kalendariq-grid {
    grid-auto-rows: auto;
  }
}
</style>
