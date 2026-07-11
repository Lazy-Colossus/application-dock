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

    <!-- Clean end. -->
    <div
      v-else-if="finished"
      class="drill-state column flex-center"
      data-testid="drill-done"
    >
      <div class="drill-done__glyph">蛍</div>
      <div>Session complete.</div>
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

      <div class="drill-tools row justify-end q-mb-sm">
        <button
          v-if="aidAvailable"
          class="drill-aid"
          :class="{ 'drill-aid--on': aidOn }"
          :aria-pressed="aidOn"
          data-testid="reading-aid-toggle"
          @click="toggleAid"
        >
          <q-icon :name="aidOn ? 'visibility' : 'visibility_off'" size="16px" />
          <span>{{ revealed ? "Romaji" : "ふりがな" }}</span>
        </button>
      </div>

      <div class="drill-cardwrap col column">
        <Flashcard
          :word="current.word"
          :revealed="revealed"
          :show-reading="showReading"
          :show-romaji="showRomaji"
        />
      </div>

      <q-btn
        v-if="!revealed"
        class="drill-btn full-width q-mt-md"
        label="Reveal"
        unelevated
        no-caps
        data-testid="reveal-btn"
        @click="reveal"
      />
      <GradeButtons v-else class="q-mt-md" @grade="onGrade" />
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
import { useDrill } from "@/apps/hotaru/composables/useDrill";
import { useHotaruPracticeStore } from "@/apps/hotaru/stores/useHotaruPracticeStore";
import { useHotaruUserStore } from "@/apps/hotaru/stores/useHotaruUserStore";
import type { DrillGrade } from "@/apps/hotaru/types";
import "./../css/hotaru.sass";

const store = useHotaruPracticeStore();
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

// The user this session belongs to (captured at mount) — grades are always
// attributed to them, even if the active user changes mid-session.
let drillUser = "";
let flushing = false;

// Drain the buffered grades to the server, one batch at a time. Serialised via
// `flushing` so syncs never overlap (preserving grade order); called after every
// grade so progress survives a mid-session close, plus on end/unmount/switch as
// a safety net. Fire-and-forget — the UI never waits on it (optimistic).
async function flushGrades(): Promise<void> {
  if (!drillUser || flushing) return;
  flushing = true;
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
    flushing = false;
  }
}

function onGrade(g: DrillGrade): void {
  grade(g);
  void flushGrades();
}

// Per-session reveal aids: furigana (kana above kanji, on the prompt) and
// romaji (on the reveal). One "eye" button toggles whichever fits the step.
const showReading = ref(false);
const showRomaji = ref(false);

// The aid only makes sense when the card has something to reveal: furigana
// needs a kanji headword (a kana-only word already shows its kana); romaji
// needs a romaji value.
const aidAvailable = computed(() => {
  const w = current.value?.word;
  if (!w) return false;
  return revealed.value ? !!w.romaji : !!w.kanji;
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
  await store.loadQueue(scope, userStore.activeUserId);
});

// Safety-net syncs: when the session ends and when leaving the page.
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

.drill-cardwrap
  display: flex

.drill-btn
  height: 52px
  border-radius: 14px
  background: linear-gradient(180deg, var(--hotaru-bamboo-bright), var(--hotaru-bamboo))
  color: var(--hotaru-bamboo-on)
  box-shadow: 0 8px 20px rgba(16, 168, 159, 0.4), 0 0 20px rgba(56, 240, 230, 0.22)
</style>
