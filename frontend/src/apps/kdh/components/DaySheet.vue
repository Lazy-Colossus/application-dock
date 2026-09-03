<template>
  <q-card class="kdh-sheet q-pa-md">
    <div class="row items-center justify-between q-mb-md">
      <div class="text-subtitle1" data-testid="sheet-date">{{ heading }}</div>
      <q-btn
        flat
        dense
        round
        icon="close"
        aria-label="Close"
        data-testid="sheet-close"
        @click="$emit('close')"
      />
    </div>

    <div v-if="rows.length === 0" class="kdh-muted" data-testid="sheet-empty">
      Nobody has picked this day.
    </div>

    <div v-else class="column q-gutter-xs" data-testid="sheet-roster">
      <div
        v-for="row in rows"
        :key="row.invitee.id"
        class="row items-center no-wrap kdh-sheet-row"
        :class="{ tentative: row.status === 'if_needed' }"
        :data-testid="`sheet-row-${row.invitee.id}`"
      >
        <span class="kdh-dot" :style="{ background: row.invitee.color }" />
        <span class="col">{{ row.invitee.name }}</span>
        <span v-if="row.status === 'if_needed'" class="kdh-muted caveat">
          if needed
        </span>
        <span v-if="row.invitee.id === claimedId" class="kdh-muted">you</span>
      </div>
    </div>

    <!-- Explicit here rather than a cycling tap: this is where a person
         deliberately answers. The grid still cycles for a quick pass. -->
    <div v-if="claimedId && !past" class="q-mt-md">
      <div class="kdh-muted q-mb-xs">Can you make it?</div>
      <div class="row q-gutter-xs">
        <q-btn
          v-for="option in OPTIONS"
          :key="option.value"
          unelevated
          no-caps
          dense
          class="col"
          :class="{ 'kdh-chosen-state': option.value === myStatus }"
          :outline="option.value !== myStatus"
          :label="option.label"
          :data-testid="`set-${option.value}`"
          @click="$emit('set', option.value)"
        />
      </div>
    </div>

    <!-- Unclaimed on a day you could still answer: the prompt is here, in the
         context of the day you just tapped, rather than intercepting the tap. -->
    <div v-else-if="!past" class="q-mt-md">
      <q-btn
        outline
        no-caps
        dense
        class="full-width"
        label="Say who you are to answer"
        data-testid="claim-prompt"
        @click="$emit('claim')"
      />
    </div>

    <div v-else class="kdh-muted q-mt-md" data-testid="sheet-past">
      This day has been and gone.
    </div>

    <!-- In the day's own context, not a separate mode. Allowed on a past day:
         unlike a vote, this is a record, and a record may be corrected. -->
    <div v-if="isAdmin" class="q-mt-md">
      <q-btn
        unelevated
        no-caps
        dense
        class="full-width"
        :outline="!chosen"
        :class="{ 'kdh-chosen-state': chosen }"
        :label="chosen ? 'This is the day ✓' : 'Make this the day'"
        data-testid="toggle-chosen"
        @click="$emit('chosen', !chosen)"
      />
    </div>
  </q-card>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Invitee, VoteStatus } from "@/apps/kdh/types";

const props = defineProps<{
  date: string;
  invitees: Invitee[];
  votes: Record<string, VoteStatus>;
  claimedId: string | null;
  past: boolean;
  chosen: boolean;
  isAdmin: boolean;
}>();

defineEmits<{
  close: [];
  set: [status: VoteStatus | "none"];
  chosen: [chosen: boolean];
  claim: [];
}>();

const OPTIONS = [
  { value: "yes" as const, label: "Free" },
  { value: "if_needed" as const, label: "If needed" },
  { value: "none" as const, label: "Can't" },
];

const heading = computed(() => {
  const [y, m, d] = props.date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
});

/**
 * Everyone on this day, in roster order. Includes people since removed, because
 * a past day keeps their answer and their name still has to render (AR-7).
 */
const rows = computed(() =>
  [...props.invitees]
    .filter((i) => props.votes[i.id] !== undefined)
    .sort((a, b) => a.order - b.order)
    .map((invitee) => ({ invitee, status: props.votes[invitee.id] })),
);

const myStatus = computed<VoteStatus | "none">(() =>
  props.claimedId ? (props.votes[props.claimedId] ?? "none") : "none",
);
</script>

<style scoped>
.kdh-sheet {
  min-width: 300px;
  background: var(--kdh-field-raise);
  color: var(--kdh-ink-hi);
}
.kdh-muted {
  color: var(--kdh-ink-mid);
  font-size: 13px;
}
.kdh-sheet-row {
  gap: 8px;
  padding: 6px 0;
}
/* Set apart by weight and style — never by tinting their colour, which has to
   keep meaning "that person". */
.tentative {
  font-style: italic;
  opacity: 0.72;
}
.caveat {
  font-style: italic;
}
.kdh-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: none;
}
.kdh-chosen-state {
  background: var(--kdh-wash-6);
  color: var(--kdh-ink-on-light);
  font-weight: 600;
}
</style>
