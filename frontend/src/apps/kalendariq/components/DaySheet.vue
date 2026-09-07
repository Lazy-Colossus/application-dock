<template>
  <q-card class="kalendariq-panel kalendariq-sheet">
    <div class="s-head">
      <span class="s-date" data-testid="sheet-date">{{ heading }}</span>
      <q-btn
        flat
        dense
        round
        size="sm"
        icon="close"
        aria-label="Close"
        data-testid="sheet-close"
        @click="$emit('close')"
      />
    </div>

    <template v-if="rows.length > 0">
      <!-- The day's shape before any name: how much of the roster this day
           covers, and how much of that leans on an "if needed". -->
      <div class="bar" data-testid="sheet-bar">
        <i class="b-free" :style="{ flexGrow: String(freeCount) }" />
        <i class="b-maybe" :style="{ flexGrow: String(ifNeededCount) }" />
        <i :style="{ flexGrow: String(awayCount) }" />
      </div>
      <div class="bar-key">
        <span><i class="swatch b-free" />{{ freeCount }} free</span>
        <span v-if="ifNeededCount > 0"
          ><i class="swatch b-maybe" />{{ ifNeededCount }} if needed</span
        >
        <span v-if="awayCount > 0"
          ><i class="swatch b-away" />{{ awayCount }} not coming</span
        >
      </div>

      <div class="grp" data-testid="sheet-roster">
        <div class="grp-h">
          Coming<span class="cnt">{{ answered.length }}</span>
        </div>
        <div
          v-for="row in rows"
          :key="row.invitee.id"
          class="row2"
          :class="{
            tentative: row.status === 'if_needed',
            mine: row.invitee.id === claimedId,
          }"
          :data-testid="`sheet-row-${row.invitee.id}`"
        >
          <span class="g" :class="glyphFor(row.status)" />
          <span>{{ row.invitee.name }}</span>

          <!-- Hover peeks on a pointer; the click-through menu is what makes it
               reachable on a touch screen, which has no hover at all. -->
          <button
            v-if="row.note"
            class="note-pip"
            :aria-label="`Note from ${row.invitee.name}`"
            :data-testid="`note-${row.invitee.id}`"
          >
            <q-icon name="sticky_note_2" size="14px" />
            <q-tooltip class="kalendariq-panel kalendariq-note-pop" :delay="120">{{
              row.note
            }}</q-tooltip>
            <q-menu class="kalendariq-panel kalendariq-note-pop">{{ row.note }}</q-menu>
          </button>

          <span v-if="row.status === 'if_needed'" class="tag">IF NEEDED</span>
          <span v-else-if="!row.status" class="tag">NOTE ONLY</span>
          <span v-else-if="row.invitee.id === claimedId" class="tag">YOU</span>
        </div>
      </div>
    </template>

    <div v-else class="kalendariq-muted" data-testid="sheet-empty">
      Nobody has picked this day.
    </div>

    <!-- Explicit here rather than a cycling tap: this is where a person
         deliberately answers. The grid still cycles for a quick pass. -->
    <template v-if="claimedId && !past">
      <div class="ans-label">Can you make it?</div>
      <div class="ans">
        <button
          v-for="option in OPTIONS"
          :key="option.value"
          class="ans-btn"
          :class="{ on: option.value === myStatus }"
          :data-testid="`set-${option.value}`"
          @click="$emit('set', option.value)"
        >
          <span class="g" :class="option.glyph" />{{ option.label }}
        </button>
      </div>

      <div v-if="!noteOpen">
        <button class="ans-btn full" data-testid="note-open" @click="openNote">
          {{ myNote ? "Edit note" : "Add note" }}
        </button>
      </div>
      <!-- Revealed in the space the button occupied, rather than opening another
           surface on top of a sheet that is already one. -->
      <div v-else class="note-edit">
        <q-input
          v-model="noteDraft"
          dense
          outlined
          autofocus
          class="col"
          :maxlength="NOTE_MAX_LENGTH"
          data-testid="note-input"
          @keyup.enter="saveNote"
        />
        <button class="ans-btn" data-testid="note-save" @click="saveNote">
          Save
        </button>
      </div>
    </template>

    <!-- Unclaimed on a day you could still answer: the prompt is here, in the
         context of the day you just tapped, rather than intercepting the tap. -->
    <div v-else-if="!past">
      <button
        class="ans-btn full"
        data-testid="claim-prompt"
        @click="$emit('claim')"
      >
        Say who you are to answer
      </button>
    </div>

    <div v-else class="kalendariq-muted" data-testid="sheet-past">
      This day has been and gone.
    </div>

    <!-- In the day's own context, not a separate mode. Allowed on a past day:
         unlike a vote, this is a record, and a record may be corrected. -->
    <button
      v-if="isAdmin"
      class="ans-btn full"
      :class="{ chosen }"
      data-testid="toggle-chosen"
      @click="$emit('chosen', !chosen)"
    >
      {{ chosen ? "This is the day ✓" : "Make this the day" }}
    </button>
  </q-card>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { NOTE_MAX_LENGTH } from "@/apps/kalendariq/types";
import type { Invitee, VoteStatus } from "@/apps/kalendariq/types";

const props = defineProps<{
  date: string;
  invitees: Invitee[];
  votes: Record<string, VoteStatus>;
  notes: Record<string, string>;
  claimedId: string | null;
  past: boolean;
  chosen: boolean;
  isAdmin: boolean;
}>();

const emit = defineEmits<{
  close: [];
  set: [status: VoteStatus | "none"];
  chosen: [chosen: boolean];
  claim: [];
  note: [text: string];
}>();

const OPTIONS = [
  { value: "yes" as const, label: "Free", glyph: "free" },
  { value: "if_needed" as const, label: "If needed", glyph: "maybe" },
  { value: "none" as const, label: "Can't", glyph: "no" },
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
 * Everyone with an answer **or** a note. A note is why someone who cannot come
 * still belongs in the list — saying why is the whole point of it. The bar's
 * counts stay vote-only, so a note never moves the day's shape.
 */
const rows = computed(() =>
  [...props.invitees]
    .filter(
      (i) => props.votes[i.id] !== undefined || props.notes[i.id] !== undefined,
    )
    .sort((a, b) => a.order - b.order)
    .map((invitee) => ({
      invitee,
      status: props.votes[invitee.id],
      note: props.notes[invitee.id],
    })),
);

const answered = computed(() =>
  props.invitees.filter((i) => props.votes[i.id] !== undefined),
);

const activeTotal = computed(
  () => props.invitees.filter((i) => i.removed_at === null).length,
);
const freeCount = computed(
  () => answered.value.filter((i) => props.votes[i.id] === "yes").length,
);
const ifNeededCount = computed(
  () => answered.value.filter((i) => props.votes[i.id] === "if_needed").length,
);
/** Everyone else on the roster: silent or not coming, which are the same thing. */
const awayCount = computed(() =>
  Math.max(0, activeTotal.value - answered.value.length),
);

const myStatus = computed<VoteStatus | "none">(() =>
  props.claimedId ? (props.votes[props.claimedId] ?? "none") : "none",
);

const noteOpen = ref(false);
const noteDraft = ref("");

const myNote = computed(() =>
  props.claimedId ? (props.notes[props.claimedId] ?? "") : "",
);

function openNote(): void {
  noteDraft.value = myNote.value;
  noteOpen.value = true;
}

function saveNote(): void {
  emit("note", noteDraft.value);
  noteOpen.value = false;
}

function glyphFor(status: VoteStatus | undefined): string {
  if (status === "yes") return "free";
  if (status === "if_needed") return "maybe";
  return "no";
}
</script>

<style scoped>
.kalendariq-sheet {
  min-width: 300px;
  padding: 16px 15px;
  display: flex;
  flex-direction: column;
  gap: 13px;
}
.s-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.s-date {
  font-size: 16px;
  font-weight: 600;
}
.kalendariq-muted {
  color: var(--kalendariq-ink-mid);
  font-size: 13px;
}

/* --- the day's shape --- */
.bar {
  display: flex;
  height: 9px;
  border-radius: 5px;
  overflow: hidden;
  background: rgba(167, 155, 188, 0.16);
}
.bar i {
  display: block;
}
.b-free {
  background: var(--kalendariq-wash-6);
}
/* Hatched, the same language the grid uses for provisional coverage. */
.b-maybe {
  background: repeating-linear-gradient(
    135deg,
    var(--kalendariq-wash-6) 0 3px,
    rgba(201, 174, 230, 0.35) 3px 6px
  );
}
.bar-key {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--kalendariq-ink-mid);
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
.bar-key span {
  display: flex;
  align-items: center;
  gap: 5px;
}
.swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex: none;
}
.swatch.b-away {
  box-shadow: inset 0 0 0 1.5px var(--kalendariq-ink-lo);
}

/* --- the roster --- */
.grp {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.grp-h {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 5px 0 3px;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 10.5px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--kalendariq-ink-lo);
}
.grp-h .cnt {
  margin-left: auto;
  color: var(--kalendariq-ink-mid);
}
.row2 {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 8px;
  border-radius: 7px;
  font-size: 14px;
}
.row2 .tag {
  margin-left: auto;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 10.5px;
  letter-spacing: 0.1em;
  color: var(--kalendariq-ink-lo);
}
.mine {
  background: rgba(201, 174, 230, 0.1);
  box-shadow: inset 0 0 0 1px rgba(201, 174, 230, 0.28);
}
/* Style as well as shape, so the distinction never rests on one signal. */
.tentative {
  font-style: italic;
}
.note-pip {
  display: inline-flex;
  align-items: center;
  padding: 2px;
  border: none;
  background: none;
  color: var(--kalendariq-wash-6);
  cursor: pointer;
}

/* --- status glyphs: filled, half, hollow --- */
.g {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  flex: none;
  position: relative;
}
.g.free {
  background: var(--kalendariq-wash-6);
}
.g.maybe {
  background: linear-gradient(90deg, var(--kalendariq-wash-6) 50%, transparent 50%);
  box-shadow: inset 0 0 0 1.5px var(--kalendariq-wash-6);
}
.g.no {
  box-shadow: inset 0 0 0 1.5px var(--kalendariq-ink-lo);
  opacity: 0.55;
}

/* --- your answer --- */
.ans-label {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--kalendariq-ink-lo);
}
.ans {
  display: flex;
  gap: 6px;
}
.note-edit {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ans-btn {
  /* An equal third each, but never narrower than the label needs: selecting an
     answer turns it semibold, and "If needed" is wide enough that the extra
     weight alone used to push it onto a second line. */
  flex: 1;
  min-width: max-content;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 6px;
  border-radius: 8px;
  border: 1px solid var(--kalendariq-field-line);
  background: transparent;
  color: var(--kalendariq-ink-mid);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}
.ans-btn.full {
  width: 100%;
}
.ans-btn.on {
  background: var(--kalendariq-wash-3);
  color: var(--kalendariq-ink-hi);
  border-color: transparent;
  font-weight: 600;
}
.ans-btn.chosen {
  background: var(--kalendariq-gold);
  color: var(--kalendariq-ink-on-light);
  border-color: transparent;
  font-weight: 600;
}
/* Green for yes and yellow for sort-of, but only on the control where you give
   your own answer — everyday language, on the one element about to be pressed. */
.ans-btn .g.free {
  background: var(--kalendariq-yes);
}
.ans-btn .g.maybe {
  background: linear-gradient(90deg, var(--kalendariq-maybe) 50%, transparent 50%);
  box-shadow: inset 0 0 0 1.5px var(--kalendariq-maybe);
}
</style>
