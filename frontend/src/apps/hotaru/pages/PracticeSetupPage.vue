<template>
  <q-page class="hotaru-app column no-wrap q-pa-md">
    <FireflyLayer />
    <div class="practice-title hotaru-glow q-mb-md">
      What shall we practise?
    </div>

    <!-- Lessons -->
    <div class="practice-group-label">Lessons</div>
    <div v-if="lessonScopes.length === 0" class="practice-empty">
      No lessons yet.
    </div>
    <div v-else class="practice-chips row items-center q-gutter-xs q-mb-md">
      <button
        v-for="l in lessonScopes"
        :key="l"
        class="practice-chip"
        :class="{ 'practice-chip--active': selected === `lesson:${l}` }"
        :data-testid="`scope-lesson-${l}`"
        @click="select(`lesson:${l}`)"
      >
        {{ l }}
      </button>
    </div>

    <!-- Topics -->
    <div class="practice-group-label">Topics</div>
    <div v-if="store.topics.length === 0" class="practice-empty">
      No topics yet.
    </div>
    <div v-else class="practice-chips row items-center q-gutter-xs q-mb-md">
      <button
        v-for="t in store.topics"
        :key="t.id"
        class="practice-chip"
        :class="{ 'practice-chip--active': selected === `topic:${t.id}` }"
        :data-testid="`scope-topic-${t.id}`"
        @click="select(`topic:${t.id}`)"
      >
        {{ t.name }}
      </button>
    </div>

    <!-- Overview -->
    <div
      v-if="practice.loading"
      class="practice-state"
      data-testid="overview-loading"
    >
      Loading…
    </div>
    <div
      v-else-if="practice.error"
      class="practice-state"
      data-testid="overview-error"
    >
      {{ practice.error }}
    </div>
    <div
      v-else-if="practice.overview"
      class="practice-overview hotaru-panel column"
      data-testid="overview"
    >
      <div
        v-if="selected === null"
        class="practice-overview__all"
        data-testid="overview-all"
      >
        All words
      </div>
      <div class="practice-count" data-testid="overview-count">
        {{ practice.overview.word_count }} words
      </div>
      <div
        v-for="(count, tier) in practice.overview.familiarity"
        :key="tier"
        class="practice-tier row items-center justify-between"
        :data-testid="`tier-${tier}`"
      >
        <FamiliarityIcon :tier="tier" show-label />
        <span>{{ count }}</span>
      </div>

      <!-- Quick Practice: build a session from the whole list by preset. -->
      <div v-if="selected === null" class="quick column" data-testid="quick">
        <div class="quick__title">Quick practice</div>

        <div class="practice-group-label">Familiarity</div>
        <div class="practice-chips row items-center q-gutter-xs q-mb-sm">
          <button
            v-for="p in FAMILIARITY_PRESETS"
            :key="p.key"
            class="practice-chip"
            :class="{ 'practice-chip--active': quickPreset === p.key }"
            :data-testid="`quick-fam-${p.key}`"
            @click="quickPreset = p.key"
          >
            {{ p.label }}
          </button>
        </div>

        <div class="practice-group-label">Lessons</div>
        <div
          v-if="lessonScopes.length"
          class="practice-chips row items-center q-gutter-xs q-mb-sm"
        >
          <button
            v-for="l in lessonScopes"
            :key="l"
            class="practice-chip"
            :class="{ 'practice-chip--active': quickLessons.includes(l) }"
            :data-testid="`quick-lesson-${l}`"
            @click="toggleQuickLesson(l)"
          >
            {{ l }}
          </button>
        </div>

        <div class="practice-group-label">Words per session</div>
        <div class="practice-chips row items-center q-gutter-xs q-mb-sm">
          <button
            v-for="opt in COUNT_OPTIONS"
            :key="opt.value"
            class="practice-chip"
            :class="{ 'practice-chip--active': countValue === opt.value }"
            :data-testid="`count-opt-${opt.value}`"
            @click="countValue = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>

        <div
          class="quick__count"
          :class="{ 'quick__count--empty': quickSessionCount === 0 }"
          data-testid="quick-count"
        >
          {{ quickSessionCount }}
          {{ quickSessionCount === 1 ? "word" : "words" }}
        </div>
      </div>

      <!-- Direction + scoring — for both a chosen scope and Quick Practice
           (Story 2.12). Reuses the shared direction/mode state + setDirection. -->
      <div class="practice-opts column q-mt-md">
        <div class="practice-opt row items-center justify-between">
          <span class="practice-opt__label">Direction</span>
          <div class="practice-seg row no-wrap">
            <button
              class="practice-seg__btn"
              :class="{ 'practice-seg__btn--on': direction === 'r2m' }"
              data-testid="dir-r2m"
              @click="setDirection('r2m')"
            >
              JP → EN
            </button>
            <button
              class="practice-seg__btn"
              :class="{ 'practice-seg__btn--on': direction === 'm2r' }"
              data-testid="dir-m2r"
              @click="setDirection('m2r')"
            >
              EN → JP
            </button>
          </div>
        </div>
        <div class="practice-opt row items-center justify-between">
          <span class="practice-opt__label">Scoring</span>
          <div class="practice-seg row no-wrap">
            <button
              class="practice-seg__btn"
              :class="{ 'practice-seg__btn--on': mode === 'self' }"
              data-testid="mode-self"
              @click="mode = 'self'"
            >
              Self-grade
            </button>
            <button
              class="practice-seg__btn"
              :class="{ 'practice-seg__btn--on': mode === 'typed' }"
              :disabled="direction === 'r2m'"
              data-testid="mode-typed"
              @click="mode = 'typed'"
            >
              Typed
            </button>
          </div>
        </div>
      </div>

      <q-btn
        v-if="selected === null"
        class="practice-start full-width q-mt-md"
        label="Quick practice ✦"
        unelevated
        no-caps
        :disable="quickCount === 0"
        data-testid="start-quick"
        @click="startQuick"
      />

      <div
        v-if="selected !== null"
        class="practice-cta row no-wrap q-gutter-sm q-mt-md"
      >
        <q-btn
          class="practice-study col"
          label="Study"
          unelevated
          no-caps
          data-testid="start-study"
          @click="startStudy"
        />
        <q-btn
          class="practice-start col"
          label="Let's practice ✦"
          unelevated
          no-caps
          data-testid="start-drill"
          @click="startDrill"
        />
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import FireflyLayer from "@/apps/hotaru/components/FireflyLayer.vue";
import FamiliarityIcon from "@/apps/hotaru/components/FamiliarityIcon.vue";
import { useHotaruLibraryStore } from "@/apps/hotaru/stores/useHotaruLibraryStore";
import { useHotaruPracticeStore } from "@/apps/hotaru/stores/useHotaruPracticeStore";
import { useHotaruUserStore } from "@/apps/hotaru/stores/useHotaruUserStore";
import "./../css/hotaru.sass";

const store = useHotaruLibraryStore();
const practice = useHotaruPracticeStore();
const userStore = useHotaruUserStore();
const router = useRouter();
const route = useRoute();

const selected = ref<string | null>(null);

// Practice-your-way choices (Story 2.4): recognition vs production, and how to
// score. Typed scoring is EN→JP-only, so JP→EN forces it back to self-grade.
type Direction = "r2m" | "m2r";
type ScoringMode = "self" | "typed";
const direction = ref<Direction>("r2m");
const mode = ref<ScoringMode>("self");

function setDirection(d: Direction): void {
  direction.value = d;
  if (d === "r2m") mode.value = "self";
}

// Lessons available as scopes — the empty lesson (un-filed custom words) is not
// a practisable scope.
const lessonScopes = computed(() => store.lessons.filter((l) => l !== ""));

// --- Quick Practice (Story 2.9): build a session from the whole list -------
// Each familiarity preset maps to a tier set (null = any tier). New = tier 0.
const FAMILIARITY_PRESETS: {
  key: string;
  label: string;
  tiers: number[] | null;
}[] = [
  { key: "new", label: "New", tiers: [0] },
  { key: "seen", label: "Seen once", tiers: [1, 2, 3, 4] },
  { key: "learning", label: "Learning", tiers: [1] },
  { key: "familiar", label: "Familiar", tiers: [2] },
  { key: "strong", label: "Strong", tiers: [3] },
  { key: "mastered", label: "Mastered", tiers: [4] },
  { key: "all", label: "All", tiers: null },
];

const quickPreset = ref("new");
const quickLessons = ref<string[]>([]);

function toggleQuickLesson(lesson: string): void {
  const i = quickLessons.value.indexOf(lesson);
  if (i >= 0) quickLessons.value.splice(i, 1);
  else quickLessons.value.push(lesson);
}

// Words-per-session options — "All" (0 = no cap) + fixed sizes. Default All.
const COUNT_OPTIONS: { label: string; value: number }[] = [
  { label: "All", value: 0 },
  { label: "5", value: 5 },
  { label: "10", value: 10 },
  { label: "20", value: 20 },
  { label: "30", value: 30 },
  { label: "50", value: 50 },
  { label: "100", value: 100 },
];
const countValue = ref(0);

const quickTiers = computed<number[] | null>(
  () =>
    FAMILIARITY_PRESETS.find((p) => p.key === quickPreset.value)?.tiers ?? null,
);

// Live match count from the words + familiarity the picker already holds — an
// instant preview; the launched queue is the server's authoritative set.
// How many words match the familiarity + lesson filters (drives the empty state).
const quickCount = computed(
  () =>
    store.words.filter((w) => {
      if (quickLessons.value.length && !quickLessons.value.includes(w.lesson))
        return false;
      const tiers = quickTiers.value;
      if (tiers && !tiers.includes(store.familiarityTier(w.id))) return false;
      return true;
    }).length,
);

// The actual session size = matches capped by the words-per-session choice
// (0 = All, no cap). This is what the preview shows.
const quickSessionCount = computed(() =>
  countValue.value > 0
    ? Math.min(quickCount.value, countValue.value)
    : quickCount.value,
);

function startQuick(): void {
  if (quickCount.value === 0) return;
  const parts = [
    "scope=all",
    `label=${encodeURIComponent("Quick practice")}`,
    `direction=${direction.value}`,
    `mode=${mode.value}`,
  ];
  const tiers = quickTiers.value;
  if (tiers) parts.push(`tiers=${tiers.join(",")}`);
  if (quickLessons.value.length)
    parts.push(
      `lessons=${quickLessons.value.map(encodeURIComponent).join(",")}`,
    );
  // Words-per-session: 0 = All (no cap) on the backend.
  parts.push(`limit=${countValue.value}`);
  void router.push(`/hotaru/drill?${parts.join("&")}`);
}

// Remember the preset per user (client-side, like the active user itself).
function quickKey(user: string): string {
  return `hotaru.quick.${user}`;
}
watch(
  [quickPreset, quickLessons],
  () => {
    const user = userStore.activeUserId;
    if (user === null) return;
    localStorage.setItem(
      quickKey(user),
      JSON.stringify({
        preset: quickPreset.value,
        lessons: quickLessons.value,
      }),
    );
  },
  { deep: true },
);

function restoreQuickPreset(user: string): void {
  const raw = localStorage.getItem(quickKey(user));
  if (!raw) return;
  try {
    const saved = JSON.parse(raw) as { preset?: string; lessons?: string[] };
    if (
      typeof saved.preset === "string" &&
      FAMILIARITY_PRESETS.some((p) => p.key === saved.preset)
    ) {
      quickPreset.value = saved.preset;
    }
    if (Array.isArray(saved.lessons)) quickLessons.value = saved.lessons;
  } catch {
    // Ignore malformed saved state — fall back to defaults.
  }
}

function select(scope: string): void {
  const user = userStore.activeUserId;
  if (user === null) return;
  // Clicking the active scope again closes it — back to the all-words summary
  // and Quick Practice.
  if (selected.value === scope) {
    selected.value = null;
    void practice.loadOverview("all", user);
    return;
  }
  selected.value = scope;
  void practice.loadOverview(scope, user);
}

// Friendly name for the chosen scope, passed to the drill so it can show
// "what we're practising" (the picker knows lesson codes / topic names).
function scopeLabel(scope: string): string {
  const [kind, value] = scope.split(":");
  if (kind === "topic") return store.topicById(value)?.name ?? value;
  return value;
}

function startDrill(): void {
  if (selected.value === null) return;
  const q =
    `scope=${encodeURIComponent(selected.value)}` +
    `&label=${encodeURIComponent(scopeLabel(selected.value))}` +
    `&direction=${direction.value}&mode=${mode.value}`;
  void router.push(`/hotaru/drill?${q}`);
}

// Study is the un-graded browse — just carry the scope, no direction/mode.
function startStudy(): void {
  if (selected.value === null) return;
  void router.push(`/hotaru/study?scope=${encodeURIComponent(selected.value)}`);
}

onMounted(async () => {
  if (userStore.users.length === 0) await userStore.loadUsers();
  if (userStore.activeUserId === null) {
    void router.replace("/hotaru/identity");
    return;
  }
  await Promise.all([
    store.loadWords(userStore.activeUserId),
    store.loadTopics(),
    store.loadFamiliarity(userStore.activeUserId),
  ]);
  restoreQuickPreset(userStore.activeUserId);
  // Drop any stale overview from a previous visit. If we arrived back from a
  // drill (?scope=), re-select that scope so its freshly-updated stats load.
  // Otherwise show the at-a-glance stats across all words (no scope selected).
  practice.clearOverview();
  const scope = route.query.scope;
  if (typeof scope === "string" && scope) {
    select(scope);
  } else {
    void practice.loadOverview("all", userStore.activeUserId);
  }
});
</script>

<style scoped lang="sass">
.practice-title
  font-size: 22px
  font-weight: 600
  color: var(--hotaru-cream)

.practice-group-label
  font-size: 13px
  color: var(--hotaru-cream-soft)
  margin-bottom: 6px

.practice-chips
  overflow-x: auto

.practice-chip
  border: 1px solid rgba(155, 107, 255, 0.30)
  background: rgba(155, 107, 255, 0.12)
  color: var(--hotaru-cream-soft)
  border-radius: 9999px
  padding: 4px 12px
  font-size: 13px
  cursor: pointer

.practice-chip--active
  background: var(--hotaru-bamboo)
  color: var(--hotaru-bamboo-on)
  border-color: var(--hotaru-bamboo)
  box-shadow: 0 0 14px rgba(56, 240, 230, 0.35)

.practice-empty
  color: var(--hotaru-cream-soft)
  font-size: 13px
  margin-bottom: 16px

.practice-state
  color: var(--hotaru-cream-soft)
  text-align: center
  padding: 24px 0

.practice-overview
  border: 1px solid rgba(155, 107, 255, 0.28)
  border-radius: 12px
  padding: 14px
  margin-top: 8px

.practice-overview__all
  font-size: 12px
  letter-spacing: 0.08em
  text-transform: uppercase
  color: var(--hotaru-cream-soft)
  margin-bottom: 2px

.practice-count
  font-size: 18px
  font-weight: 600
  color: var(--hotaru-cream)
  margin-bottom: 8px

.practice-tier
  font-size: 14px
  color: var(--hotaru-cream-soft)
  padding: 3px 0

// Quick Practice panel — sits under the all-words stats, separated by a rule.
.quick
  margin-top: 14px
  padding-top: 14px
  border-top: 1px solid rgba(155, 107, 255, 0.22)

.quick__title
  font-size: 15px
  font-weight: 600
  color: var(--hotaru-cream)
  margin-bottom: 8px

.quick__count
  font-size: 14px
  color: var(--hotaru-cream-soft)
  margin-top: 2px

// Zero matches → magenta, signalling the (disabled) CTA won't start anything.
.quick__count--empty
  color: var(--hotaru-fam-5)

.practice-opts
  gap: 10px

.practice-opt__label
  font-size: 13px
  color: var(--hotaru-cream-soft)

// Compact segmented control (mobile-first) — a rounded track with two pills.
.practice-seg
  border: 1px solid rgba(155, 107, 255, 0.30)
  border-radius: 9999px
  overflow: hidden

.practice-seg__btn
  border: none
  background: transparent
  color: var(--hotaru-cream-soft)
  padding: 5px 14px
  font-size: 13px
  cursor: pointer

.practice-seg__btn--on
  background: var(--hotaru-bamboo)
  color: var(--hotaru-bamboo-on)

.practice-seg__btn:disabled
  color: var(--hotaru-sage)
  cursor: not-allowed

.practice-start
  height: 52px
  border-radius: 14px
  background: linear-gradient(180deg, var(--hotaru-bamboo-bright), var(--hotaru-bamboo))
  color: var(--hotaru-bamboo-on)
  box-shadow: 0 8px 20px rgba(16, 168, 159, 0.4), 0 0 20px rgba(56, 240, 230, 0.22)

// Study is the calm sibling — a low-opacity cyan wash so Practice stays primary.
.practice-study
  height: 52px
  border-radius: 14px
  border: 1px solid rgba(56, 240, 230, 0.4)
  background: rgba(56, 240, 230, 0.10)
  color: var(--hotaru-cream)
</style>
