<template>
  <div class="kdh-month">
    <div class="row items-center justify-between q-mb-sm">
      <div class="kdh-month-label col" data-testid="month-label">
        {{ monthLabel }}
      </div>
      <div class="row items-center q-gutter-xs">
        <!-- Only on the way in: leaving is the Cancel on the selection bar, and
             two ways out of one mode is one too many. -->
        <button
          v-if="selectable && !selectMode"
          class="kdh-select-btn"
          data-testid="select-toggle"
          @click="$emit('toggleSelectMode')"
        >
          <q-icon name="checklist" size="16px" />Select Multiple
        </button>
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
        <q-btn
          v-if="!showingCurrentMonth"
          flat
          dense
          no-caps
          size="sm"
          label="Today"
          data-testid="jump-today"
          @click="goToToday"
        />
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
    </div>

    <div class="kdh-dow">
      <div v-for="(d, i) in WEEKDAYS" :key="i">{{ d }}</div>
    </div>

    <div class="kdh-grid">
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
import type { Invitee, VoteStatus } from "@/apps/kdh/types";

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
.kdh-select-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  padding: 6px 12px;
  border: none;
  border-radius: 999px;
  background: var(--kdh-wash-4);
  color: var(--kdh-ink-hi);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
.kdh-select-btn:hover {
  background: var(--kdh-wash-5);
  color: var(--kdh-ink-on-light);
}
.kdh-month-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--kdh-ink-mid);
}
.kdh-dow,
.kdh-grid {
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
.kdh-dow {
  padding-bottom: 2px;
}
.kdh-dow {
  font-size: 9.5px;
  letter-spacing: 0.06em;
  text-align: center;
  color: var(--kdh-ink-lo);
  margin-bottom: 4px;
}

@media (min-width: 700px) {
  .kdh-month-label {
    font-size: 16px;
  }
  .kdh-dow {
    font-size: 12px;
    margin-bottom: 6px;
  }
  .kdh-dow,
  .kdh-grid {
    --gap: 6px;
  }
  /* Square cells govern their own height now, so the rows follow the columns
     and every box is the same shape. */
  .kdh-grid {
    grid-auto-rows: auto;
  }
}
</style>
