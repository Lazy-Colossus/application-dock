<template>
  <div class="kdh-month">
    <div class="row items-center justify-between q-mb-sm">
      <div class="kdh-month-label" data-testid="month-label">
        {{ monthLabel }}
      </div>
      <div class="row items-center q-gutter-xs">
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
}>();

defineEmits<{ pick: [date: string] }>();

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

defineExpose({ monthLabel });
</script>

<style scoped>
.kdh-month-label {
  font-size: 13px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--kdh-ink-mid);
}
.kdh-dow,
.kdh-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}
.kdh-dow {
  font-size: 9.5px;
  letter-spacing: 0.06em;
  text-align: center;
  color: var(--kdh-ink-lo);
  margin-bottom: 4px;
}
</style>
