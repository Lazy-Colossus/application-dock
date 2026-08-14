<template>
  <q-page class="hotaru-app column no-wrap q-pa-md">
    <FireflyLayer />

    <div v-if="store.loading" class="drill-state" data-testid="drill-loading">
      Loading…
    </div>
    <div v-else-if="store.error" class="drill-state" data-testid="drill-error">
      {{ store.error }}
    </div>

    <!-- Nothing eligible in this scope. -->
    <div
      v-else-if="total === 0"
      class="drill-state column flex-center"
      data-testid="drill-empty"
    >
      <div>Nothing to practise here yet.</div>
      <q-btn
        class="drill-btn q-mt-md"
        label="Back to practice"
        unelevated
        no-caps
        data-testid="drill-empty-btn"
        @click="backToPicker"
      />
    </div>

    <!-- Clean end — a calm recap. -->
    <div
      v-else-if="finished"
      class="drill-state column flex-center"
      data-testid="drill-done"
    >
      <div class="drill-done__glyph">蛍</div>
      <div class="drill-done__title">Session complete.</div>

      <div class="drill-summary hotaru-panel column flex-center">
        <!-- Session breakdown: a ring split by this session's grade mix. -->
        <div class="drill-ring" data-testid="summary-ring">
          <svg
            class="drill-ring__svg"
            viewBox="-12 -12 144 144"
            aria-hidden="true"
          >
            <circle class="drill-ring__track" cx="60" cy="60" r="52" />
            <circle
              v-for="seg in ringSegments"
              :key="seg.g"
              class="drill-ring__seg"
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="currentColor"
              stroke-width="12"
              :stroke-dasharray="seg.dasharray"
              :stroke-dashoffset="seg.dashoffset"
              :style="{ color: seg.color }"
              transform="rotate(-90 60 60)"
            />
          </svg>
          <div class="drill-ring__center">
            <div class="drill-ring__count" data-testid="summary-practised">
              {{ practised }}
            </div>
            <div class="drill-ring__label">
              {{ practised === 1 ? "word" : "words" }}
            </div>
          </div>
          <SessionCelebration />
        </div>

        <div class="drill-breakdown" data-testid="summary-breakdown">
          <span class="drill-tally" data-testid="tally-correct">
            <i class="drill-dot drill-dot--correct" />Correct
            <b>{{ counts.correct }}</b>
          </span>
          <span class="drill-tally" data-testid="tally-close">
            <i class="drill-dot drill-dot--close" />Close
            <b>{{ counts.close }}</b>
          </span>
          <span class="drill-tally" data-testid="tally-incorrect">
            <i class="drill-dot drill-dot--incorrect" />Incorrect
            <b>{{ counts.incorrect }}</b>
          </span>
        </div>
      </div>

      <q-btn
        class="drill-btn q-mt-md"
        label="Back to practice"
        unelevated
        no-caps
        data-testid="drill-done-btn"
        @click="backToPicker"
      />
    </div>

    <!-- Active drill. -->
    <template v-else-if="current">
      <div class="drill-topbar row items-center justify-between q-mb-md">
        <div class="drill-scope" data-testid="drill-scope">
          <span class="drill-glyph">蛍</span> {{ scopeLabel }}
        </div>
        <div class="drill-progress" data-testid="drill-progress">
          <span>{{ progress }}</span>
          <span class="drill-bar"><i :style="{ width: fillPct + '%' }" /></span>
        </div>
      </div>

      <div class="drill-tools row items-center justify-between q-mb-sm">
        <button
          class="drill-dir"
          data-testid="direction-toggle"
          @click="toggleDirection"
        >
          {{ direction === "r2m" ? "あ → EN" : "EN → あ" }}
        </button>
        <div class="row items-center no-wrap">
          <button
            v-if="aidAvailable"
            class="drill-aid"
            :class="{ 'drill-aid--on': aidOn }"
            :aria-pressed="aidOn"
            data-testid="reading-aid-toggle"
            @click="toggleAid"
          >
            <q-icon
              :name="aidOn ? 'visibility' : 'visibility_off'"
              size="16px"
            />
            <span>{{ revealed ? "Romaji" : "ふりがな" }}</span>
          </button>
          <!-- Story 3.4: jot a note mid-drill. The button also signals whether
               this word already has a note (presence only — no spoiler): filled
               violet when a tip lives here, quiet outline otherwise. -->
          <button
            class="drill-note q-ml-sm"
            :class="{ 'drill-note--has': hasNote }"
            :aria-label="
              hasNote ? 'This word has a note — view or add' : 'Add a note'
            "
            :title="hasNote ? 'Notes' : 'Add a note'"
            data-testid="drill-add-note"
            @click="notesDialogOpen = true"
          >
            <q-icon
              :name="hasNote ? 'chat_bubble' : 'chat_bubble_outline'"
              size="15px"
            />
            <span class="drill-note__label">Note</span>
          </button>
        </div>
      </div>

      <div class="drill-cardwrap col column">
        <Flashcard
          :word="current.word"
          :revealed="revealed"
          :direction="direction"
          :show-reading="showReading"
          :show-romaji="showRomaji"
          :notes="current.notes"
          :users="userStore.users"
          :active-user="userStore.activeUserId ?? undefined"
          :submitted="typing ? typedAnswer : null"
        />
      </div>

      <template v-if="!revealed">
        <!-- Typed mode (EN→JP only): produce the reading, exact match = Correct. -->
        <div v-if="typing" class="drill-typed row no-wrap q-mt-md">
          <input
            v-model="typedAnswer"
            class="drill-typed__input col"
            type="text"
            placeholder="Type the reading…"
            autocapitalize="off"
            autocomplete="off"
            data-testid="typed-input"
            @keyup.enter="submitTyped"
          />
          <q-btn
            class="drill-typed__go"
            label="Check"
            unelevated
            no-caps
            data-testid="typed-submit"
            @click="submitTyped"
          />
        </div>
        <q-btn
          v-else
          class="drill-btn full-width"
          label="Reveal"
          unelevated
          no-caps
          data-testid="reveal-btn"
          @click="reveal"
        />
      </template>
      <GradeButtons v-else class="q-mt-md" @grade="onGrade" />

      <!-- Mid-drill notes (Story 3.4): teleported overlay — the card behind
           stays put, so closing resumes the same card. -->
      <WordNotesDialog
        v-model="notesDialogOpen"
        :word="current.word"
        :notes="current.notes ?? []"
        :users="userStore.users"
        :active-user="userStore.activeUserId ?? undefined"
        @add="onDrillAddNote"
        @flip="onDrillFlipNote"
        @edit="onDrillEditNote"
        @delete="onDrillDeleteNote"
      />
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import FireflyLayer from "@/apps/hotaru/components/FireflyLayer.vue";
import Flashcard from "@/apps/hotaru/components/Flashcard.vue";
import GradeButtons from "@/apps/hotaru/components/GradeButtons.vue";
import SessionCelebration from "@/apps/hotaru/components/SessionCelebration.vue";
import WordNotesDialog from "@/apps/hotaru/components/WordNotesDialog.vue";
import { useDrill } from "@/apps/hotaru/composables/useDrill";
import { useHotaruPracticeStore } from "@/apps/hotaru/stores/useHotaruPracticeStore";
import { useHotaruNotesStore } from "@/apps/hotaru/stores/useHotaruNotesStore";
import { useHotaruUserStore } from "@/apps/hotaru/stores/useHotaruUserStore";
import type { DrillGrade, Visibility } from "@/apps/hotaru/types";
import "./../css/hotaru.sass";

const store = useHotaruPracticeStore();
const notesStore = useHotaruNotesStore();
const userStore = useHotaruUserStore();
const router = useRouter();
const route = useRoute();

const { queue } = storeToRefs(store);
const {
  index,
  total,
  finished,
  current,
  revealed,
  progress,
  pending,
  reveal,
  grade,
} = useDrill(queue);

// Mid-drill notes (Story 3.4): open the shared WordNotesDialog over the current
// card. The dialog teleports to <body>, so the drill state below is untouched —
// closing returns to the same card. New notes are merged onto the current queue
// item so the card + dialog reflect them without a re-fetch.
const notesDialogOpen = ref(false);

// The current card's note presence — already on the queue payload (Story 3.3),
// so the mid-drill button can signal "a tip lives here" with no extra fetch.
const hasNote = computed(() => (current.value?.notes?.length ?? 0) > 0);

async function onDrillAddNote(
  text: string,
  visibility: Visibility,
): Promise<void> {
  const item = current.value;
  // Attribute to the session owner (like grades), not the live active user —
  // the session belongs to whoever started it (a switch redirects away anyway).
  if (!item || !drillUser) return;
  const created = await notesStore.addNote(
    item.word.id,
    { text, visibility },
    drillUser,
  );
  if (created) item.notes = [...(item.notes ?? []), created];
}

async function onDrillFlipNote(
  noteId: string,
  visibility: Visibility,
): Promise<void> {
  const item = current.value;
  if (!item || !drillUser) return;
  const updated = await notesStore.setVisibility(
    item.word.id,
    noteId,
    visibility,
    drillUser,
  );
  if (updated) {
    item.notes = (item.notes ?? []).map((n) => (n.id === noteId ? updated : n));
  }
}

async function onDrillEditNote(noteId: string, text: string): Promise<void> {
  const item = current.value;
  if (!item || !drillUser) return;
  const updated = await notesStore.editNote(
    item.word.id,
    noteId,
    text,
    drillUser,
  );
  if (updated) {
    item.notes = (item.notes ?? []).map((n) => (n.id === noteId ? updated : n));
  }
}

async function onDrillDeleteNote(noteId: string): Promise<void> {
  const item = current.value;
  if (!item || !drillUser) return;
  const ok = await notesStore.deleteNote(item.word.id, noteId, drillUser);
  if (ok) item.notes = (item.notes ?? []).filter((n) => n.id !== noteId);
}

// The user this session belongs to (captured at mount) — grades are always
// attributed to them, even if the active user changes mid-session.
let drillUser = "";
// Serialised background drain of buffered grades. Concurrent callers await the
// SAME in-flight drain (not an early return), so the post-session summary can
// `await flushGrades()` and be sure every grade has actually synced before it
// reads updated stats. Optimistic elsewhere — grading never waits on it.
let flushPromise: Promise<void> | null = null;

function flushGrades(): Promise<void> {
  if (!drillUser) return Promise.resolve();
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    try {
      while (pending.value.length > 0) {
        const batch = pending.value.splice(0);
        const ok = await store.submitGrades(drillUser, batch);
        if (!ok) {
          // Re-queue for the next flush (next grade / finish / unmount) and stop
          // draining — never tight-loop on a persistent failure.
          pending.value.unshift(...batch);
          break;
        }
      }
    } finally {
      flushPromise = null;
    }
  })();
  return flushPromise;
}

// Direction (JP→EN r2m / EN→JP m2r) and scoring mode come from the picker via
// the route query; direction can also be flipped per-session on the drill.
type Direction = "r2m" | "m2r";
const initialDir: Direction = route.query.direction === "m2r" ? "m2r" : "r2m";
const direction = ref<Direction>(initialDir);
const mode = ref<"self" | "typed">(
  route.query.mode === "typed" && initialDir === "m2r" ? "typed" : "self",
);

// Typed mode is EN→JP-only: an English prompt with a kana input.
const typing = computed(
  () => mode.value === "typed" && direction.value === "m2r",
);
const typedAnswer = ref("");

function toggleDirection(): void {
  direction.value = direction.value === "r2m" ? "m2r" : "r2m";
  // Typed is EN→JP-only, and the aid state belongs to the old sides.
  if (direction.value === "r2m") mode.value = "self";
  showReading.value = false;
  showRomaji.value = false;
  typedAnswer.value = "";
}

// Typed submit: an exact kana match is Correct (no reveal); a miss falls through
// to the normal reveal → self-grade path.
function submitTyped(): void {
  const w = current.value?.word;
  if (!w) return;
  if (typedAnswer.value.trim() === w.reading) {
    onGrade("correct");
  } else {
    reveal();
  }
}

// Session recap: count grades through the single choke-point (both self-grade
// and typed-Correct route here). The tallies feed the breakdown ring.
const practised = ref(0);
const counts = ref<Record<DrillGrade, number>>({
  correct: 0,
  close: 0,
  incorrect: 0,
});

function onGrade(g: DrillGrade): void {
  grade(g);
  practised.value += 1;
  counts.value[g] += 1;
  typedAnswer.value = "";
  void flushGrades();
}

// Breakdown ring — a donut split by this session's grade mix. Built from the
// local counts, so it draws instantly on finish (no post-session fetch). Fixed
// hues match the grade buttons: Correct cyan, Close amber, Incorrect magenta.
const RING_CIRC = 2 * Math.PI * 52; // r=52, centre (60,60)
const RING_GAP = 7; // arc units left blank between adjacent segments
const GRADE_COLOR: Record<DrillGrade, string> = {
  correct: "var(--hotaru-bamboo)",
  close: "var(--hotaru-amber-private)",
  incorrect: "var(--hotaru-fam-5)",
};
const ringSegments = computed(() => {
  // Order round the ring so the big Correct arc reads on the left and Incorrect
  // sits to the right (the tallies below keep the natural Correct→Incorrect order).
  const order: DrillGrade[] = ["incorrect", "close", "correct"];
  const present = order.filter((g) => counts.value[g] > 0);
  const gap = present.length > 1 ? RING_GAP : 0;
  let acc = 0;
  return present.map((g) => {
    const segLen = (counts.value[g] / practised.value) * RING_CIRC;
    const dash = Math.max(1, segLen - gap);
    const seg = {
      g,
      color: GRADE_COLOR[g],
      dasharray: `${dash} ${RING_CIRC}`,
      dashoffset: -(acc + gap / 2),
    };
    acc += segLen;
    return seg;
  });
});

// Per-session reveal aids: furigana (kana above kanji, on the prompt) and
// romaji (on the reveal). One "eye" button toggles whichever fits the step.
const showReading = ref(false);
const showRomaji = ref(false);

// The aid tracks whichever side shows Japanese: romaji on the reveal (either
// direction), and furigana only on a Japanese *prompt* (JP→EN with kanji — the
// EN→JP prompt is English, so no furigana there).
const aidAvailable = computed(() => {
  const w = current.value?.word;
  if (!w) return false;
  if (revealed.value) return !!w.romaji;
  return direction.value === "r2m" ? !!w.kanji : false;
});
const aidOn = computed(() =>
  revealed.value ? showRomaji.value : showReading.value,
);
function toggleAid(): void {
  if (revealed.value) showRomaji.value = !showRomaji.value;
  else showReading.value = !showReading.value;
}

// A friendly "what we're practising" label. The picker passes it via ?label=;
// fall back to deriving it from the scope for deep links.
const scopeLabel = computed(() => {
  const label = route.query.label;
  if (typeof label === "string" && label) return label;
  const scope = typeof route.query.scope === "string" ? route.query.scope : "";
  return scope.split(":")[1] ?? "";
});

// Progress-bar fill: cards reached / total (matches the "n / total" text).
const fillPct = computed(() =>
  total.value === 0
    ? 0
    : Math.round((Math.min(index.value + 1, total.value) / total.value) * 100),
);

// Return to the picker, carrying the scope so it re-loads that scope's stats
// (now updated by this session's grades).
function backToPicker(): void {
  const scope = typeof route.query.scope === "string" ? route.query.scope : "";
  void router.push(
    scope
      ? `/hotaru/practice?scope=${encodeURIComponent(scope)}`
      : "/hotaru/practice",
  );
}

onMounted(async () => {
  if (userStore.users.length === 0) await userStore.loadUsers();
  if (userStore.activeUserId === null) {
    void router.replace("/hotaru/identity");
    return;
  }
  drillUser = userStore.activeUserId;
  const scope = typeof route.query.scope === "string" ? route.query.scope : "";
  if (!scope) {
    // No scope chosen — send the learner back to the picker.
    void router.replace("/hotaru/practice");
    return;
  }
  // Quick Practice (Story 2.9) passes optional familiarity/lesson filters via
  // the query; a normal scoped drill has neither, so loadQueue is unchanged.
  const q = route.query;
  const tiers =
    typeof q.tiers === "string" && q.tiers
      ? q.tiers.split(",").map(Number)
      : undefined;
  const lessons =
    typeof q.lessons === "string" && q.lessons
      ? q.lessons.split(",")
      : undefined;
  const limit = typeof q.limit === "string" ? Number(q.limit) : undefined;
  await store.loadQueue(scope, userStore.activeUserId, direction.value, {
    tiers,
    lessons,
    limit,
  });
});

// On a clean end: make sure every buffered grade lands (per-grade flushes
// already ran; this guarantees the last one syncs before the recap/return).
watch(finished, (done) => {
  if (done) void flushGrades();
});
onBeforeUnmount(() => {
  void flushGrades();
});

// User-switch = hard boundary: flush the prior user's grades, discard the queue.
watch(
  () => userStore.activeUserId,
  (now) => {
    if (drillUser && now !== drillUser) {
      void flushGrades();
      void router.replace("/hotaru");
    }
  },
);
</script>

<style scoped lang="sass">
.drill-state
  color: var(--hotaru-cream-soft)
  text-align: center
  padding: 48px 0
  flex: 1
  justify-content: center

.drill-done__glyph
  font-size: 48px
  color: var(--hotaru-lamp-yellow, #ffd24a)
  text-shadow: 0 0 26px rgba(255, 210, 74, 0.7)
  margin-bottom: 8px
  animation: cel-glyph 1.2s ease-out both

@keyframes cel-glyph
  0%
    transform: scale(0.8)
    opacity: 0
  45%
    transform: scale(1.08)
    opacity: 1
  100%
    transform: scale(1)

.drill-done__title
  font-size: 16px
  color: var(--hotaru-cream)

.drill-summary
  align-self: stretch
  gap: 14px
  margin-top: 16px
  padding: 20px 16px

// Breakdown ring — a donut around the practised count.
.drill-ring
  position: relative
  width: 184px
  height: 184px
  display: grid
  place-items: center
  animation: cel-bloom 0.7s cubic-bezier(0.2, 0.8, 0.3, 1) both

@keyframes cel-bloom
  0%
    transform: scale(0.9)
    opacity: 0
  100%
    transform: scale(1)
    opacity: 1

.drill-ring__svg
  width: 100%
  height: 100%
  overflow: visible

.drill-ring__track
  fill: none
  stroke: rgba(155, 107, 255, 0.14)
  stroke-width: 12

.drill-ring__seg
  filter: drop-shadow(0 0 6px currentColor)

.drill-ring__center
  position: absolute
  display: flex
  flex-direction: column
  align-items: center

.drill-ring__count
  font-size: 30px
  font-weight: 700
  color: var(--hotaru-cream)
  line-height: 1

.drill-ring__label
  font-size: 12px
  color: var(--hotaru-sage)
  margin-top: 3px

.drill-breakdown
  display: flex
  flex-wrap: wrap
  justify-content: center
  gap: 6px 16px
  animation: cel-rise 0.5s ease-out 0.5s both

@keyframes cel-rise
  0%
    transform: translateY(6px)
    opacity: 0
  100%
    transform: translateY(0)
    opacity: 1

// Honour reduced-motion: no entrance animation, just the final state.
@media (prefers-reduced-motion: reduce)
  .drill-done__glyph, .drill-ring, .drill-breakdown
    animation: none

.drill-tally
  display: flex
  align-items: center
  gap: 6px
  font-size: 13px
  color: var(--hotaru-cream-soft)

.drill-tally b
  color: var(--hotaru-cream)
  font-variant-numeric: tabular-nums

.drill-dot
  width: 9px
  height: 9px
  border-radius: 50%
  display: inline-block

.drill-dot--correct
  background: var(--hotaru-bamboo)
  box-shadow: 0 0 8px rgba(56, 240, 230, 0.7)

.drill-dot--close
  background: var(--hotaru-amber-private)
  box-shadow: 0 0 8px rgba(255, 206, 92, 0.7)

.drill-dot--incorrect
  background: var(--hotaru-fam-5)
  box-shadow: 0 0 8px rgba(255, 92, 200, 0.7)

.drill-glyph
  color: var(--hotaru-bamboo)
  text-shadow: 0 0 12px rgba(56, 240, 230, 0.7)
  margin-right: 5px

.drill-progress
  display: flex
  align-items: center
  gap: 8px
  font-size: 13px
  color: var(--hotaru-cream-soft)

.drill-bar
  width: 54px
  height: 5px
  border-radius: 3px
  background: rgba(255, 255, 255, 0.08)
  overflow: hidden

.drill-bar i
  display: block
  height: 100%
  border-radius: 3px
  background: linear-gradient(90deg, var(--hotaru-bamboo), var(--hotaru-fam-5))
  box-shadow: 0 0 12px rgba(56, 240, 230, 0.8)

.drill-scope
  font-size: 15px
  font-weight: 600
  color: var(--hotaru-cream)

// Reserve the toggle's height even when the button is hidden, so revealing a
// card (which may add the aid button) doesn't resize the card body.
.drill-tools
  min-height: 30px
  align-items: center

.drill-aid
  display: inline-flex
  align-items: center
  gap: 5px
  border: 1px solid rgba(255, 92, 200, 0.4)
  background: rgba(255, 92, 200, 0.10)
  color: var(--hotaru-cream-soft)
  border-radius: 9999px
  padding: 4px 12px
  font-size: 12px
  cursor: pointer

.drill-aid--on
  background: var(--hotaru-fam-5)
  color: #2c0020
  border-color: var(--hotaru-fam-5)
  box-shadow: 0 0 12px rgba(255, 92, 200, 0.4)

// Mid-drill note button — a quiet violet-outlined pill on the tools row when
// the word has no note; fills solid violet with a soft glow when a note exists
// (presence signal, not the content — no answer spoiler).
.drill-note
  display: inline-flex
  align-items: center
  justify-content: center
  gap: 5px
  border: 1px solid rgba(155, 107, 255, 0.4)
  background: rgba(155, 107, 255, 0.10)
  color: var(--hotaru-cream-soft)
  border-radius: 9999px
  padding: 4px 12px
  font-size: 12px
  cursor: pointer

.drill-note__label
  line-height: 1

.drill-note--has
  background: var(--hotaru-fam-2, #9b6bff)
  border-color: var(--hotaru-fam-2, #9b6bff)
  color: #0b0620
  box-shadow: 0 0 14px rgba(155, 107, 255, 0.5)

.drill-cardwrap
  display: flex

.drill-btn
  height: 52px
  border-radius: 14px
  background: linear-gradient(180deg, var(--hotaru-bamboo-bright), var(--hotaru-bamboo))
  color: var(--hotaru-bamboo-on)
  box-shadow: 0 8px 20px rgba(16, 168, 159, 0.4), 0 0 20px rgba(56, 240, 230, 0.22)

// Per-session direction toggle — a quiet cyan-outlined pill on the tools row.
.drill-dir
  border: 1px solid rgba(56, 240, 230, 0.4)
  background: rgba(56, 240, 230, 0.08)
  color: var(--hotaru-cream-soft)
  border-radius: 9999px
  padding: 4px 12px
  font-size: 12px
  cursor: pointer

// Typed-mode answer row: kana input + a compact Check button.
.drill-typed
  gap: 10px

.drill-typed__input
  height: 52px
  border-radius: 14px
  border: 1px solid rgba(56, 240, 230, 0.35)
  background: var(--hotaru-input-bg, rgba(4, 6, 15, 0.5))
  color: var(--hotaru-cream)
  font-size: 20px
  padding: 0 16px
  outline: none

.drill-typed__input:focus
  border-color: var(--hotaru-bamboo)
  box-shadow: 0 0 14px rgba(56, 240, 230, 0.28)

.drill-typed__go
  flex: none
  height: 52px
  border-radius: 14px
  padding: 0 20px
  background: linear-gradient(180deg, var(--hotaru-bamboo-bright), var(--hotaru-bamboo))
  color: var(--hotaru-bamboo-on)
</style>
