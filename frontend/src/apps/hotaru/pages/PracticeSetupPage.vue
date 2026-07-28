<template>
  <q-page class="hotaru-app column no-wrap q-pa-md">
    <FireflyLayer />
    <div class="practice-title hotaru-glow q-mb-md">
      What shall we practise?
    </div>

    <div v-if="loading" class="practice-state" data-testid="overview-loading">
      Loading…
    </div>

    <template v-else>
      <!-- Ambient familiarity across the whole library — one compact ramp -->
      <div class="practice-ramp" data-testid="library-ramp">
        <div class="practice-ramp__bar">
          <span
            v-for="(count, tier) in allTiers"
            :key="tier"
            class="practice-ramp__seg"
            :class="`fam-seg--${tier}`"
            :style="segStyle(count, allCount)"
          />
        </div>
        <div class="practice-ramp__cap" data-testid="overview-count">
          <span>
            <b>{{ allCount }}</b> {{ allCount === 1 ? "word" : "words" }}
            <template v-if="allCount"> · mostly {{ allDominant }}</template>
          </span>
        </div>
      </div>

      <!-- Lessons -->
      <button
        class="practice-sec practice-sec--lessons"
        :class="{ 'is-open': openSection === 'lessons' }"
        data-testid="section-lessons"
        @click="toggleSection('lessons')"
      >
        <span class="practice-sec__icon" aria-hidden="true">
          <ScopeIcon kind="lessons" />
        </span>
        <span class="practice-sec__title">Lessons</span>
        <span class="practice-sec__count">{{ lessonScopes.length }}</span>
        <span class="practice-chev">›</span>
      </button>
      <div v-show="openSection === 'lessons'" class="practice-secbody">
        <div v-if="lessonScopes.length === 0" class="practice-empty">
          No lessons yet.
        </div>
        <template v-for="l in lessonScopes" :key="l">
          <button
            class="practice-row practice-row--lessons"
            :class="{ 'practice-row--on': selected === `lesson:${l}` }"
            :data-testid="`scope-lesson-${l}`"
            @click="select(`lesson:${l}`)"
          >
            <span class="practice-row__badge" aria-hidden="true">
              <ScopeIcon kind="lessons" />
            </span>
            <span class="practice-row__name">{{ l }}</span>
            <span class="practice-row__mini">
              <span
                v-for="(count, tier) in tiersOf(lessonWords(l))"
                :key="tier"
                :class="`fam-seg--${tier}`"
                :style="segStyle(count, lessonWords(l).length)"
              />
            </span>
            <span class="practice-row__count">{{ lessonWords(l).length }}</span>
            <span class="practice-row__chev">›</span>
          </button>
          <div
            v-if="selected === `lesson:${l}` && openSection === 'lessons'"
            class="practice-drawer"
            data-testid="scope-actions"
          >
            <PracticeDirectionScoring
              v-model:direction="direction"
              v-model:mode="mode"
            />
            <div class="practice-cta row no-wrap q-gutter-sm">
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
        </template>
      </div>

      <!-- Topics -->
      <button
        class="practice-sec practice-sec--topics"
        :class="{ 'is-open': openSection === 'topics' }"
        data-testid="section-topics"
        @click="toggleSection('topics')"
      >
        <span class="practice-sec__icon" aria-hidden="true">
          <ScopeIcon kind="topics" />
        </span>
        <span class="practice-sec__title">Topics</span>
        <span class="practice-sec__count">{{ store.topics.length }}</span>
        <span class="practice-chev">›</span>
      </button>
      <div v-show="openSection === 'topics'" class="practice-secbody">
        <div v-if="store.topics.length === 0" class="practice-empty">
          No topics yet.
        </div>
        <template v-for="t in store.topics" :key="t.id">
          <button
            class="practice-row practice-row--topics"
            :class="{ 'practice-row--on': selected === `topic:${t.id}` }"
            :data-testid="`scope-topic-${t.id}`"
            @click="select(`topic:${t.id}`)"
          >
            <span class="practice-row__badge" aria-hidden="true">
              <ScopeIcon kind="topics" />
            </span>
            <span class="practice-row__name">{{ t.name }}</span>
            <span class="practice-row__mini">
              <span
                v-for="(count, tier) in tiersOf(topicWords(t))"
                :key="tier"
                :class="`fam-seg--${tier}`"
                :style="segStyle(count, topicWords(t).length)"
              />
            </span>
            <span class="practice-row__count">{{ topicWords(t).length }}</span>
            <span class="practice-row__chev">›</span>
          </button>
          <div
            v-if="selected === `topic:${t.id}` && openSection === 'topics'"
            class="practice-drawer"
            data-testid="scope-actions"
          >
            <PracticeDirectionScoring
              v-model:direction="direction"
              v-model:mode="mode"
            />
            <div class="practice-cta row no-wrap q-gutter-sm">
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
        </template>
      </div>

      <!-- Quick Practice — expanded by default; tap the header to collapse.
           Nothing launches unseen: settings are open, then Start. -->
      <div
        class="practice-qcard"
        :class="{ 'is-open': openSection === 'quick' }"
        data-testid="quick"
      >
        <button
          class="practice-qcard__head"
          data-testid="quick-toggle"
          @click="toggleSection('quick')"
        >
          <span class="practice-qcard__icon" aria-hidden="true">
            <ScopeIcon kind="quick" />
          </span>
          <span class="practice-qcard__meta">
            <span class="practice-qcard__title">Quick practice</span>
            <span class="practice-qcard__sub">{{ quickSummary }}</span>
          </span>
          <span class="practice-chev">›</span>
        </button>

        <div
          v-if="openSection === 'quick'"
          class="practice-qcard__body column"
          data-testid="quick-body"
        >
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

          <div v-if="lessonScopes.length" class="practice-group-label">
            Lessons
          </div>
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
            class="quick__count q-mb-sm"
            :class="{ 'quick__count--empty': quickSessionCount === 0 }"
            data-testid="quick-count"
          >
            {{ quickSessionCount }}
            {{ quickSessionCount === 1 ? "word" : "words" }}
          </div>

          <PracticeDirectionScoring
            v-model:direction="direction"
            v-model:mode="mode"
          />

          <q-btn
            class="practice-start full-width q-mt-md"
            label="Start ✦"
            unelevated
            no-caps
            :disable="quickCount === 0"
            data-testid="start-quick"
            @click="startQuick"
          />
        </div>
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import FireflyLayer from "@/apps/hotaru/components/FireflyLayer.vue";
import PracticeDirectionScoring from "@/apps/hotaru/components/PracticeDirectionScoring.vue";
import ScopeIcon from "@/apps/hotaru/components/ScopeIcon.vue";
import { useHotaruLibraryStore } from "@/apps/hotaru/stores/useHotaruLibraryStore";
import { useHotaruUserStore } from "@/apps/hotaru/stores/useHotaruUserStore";
import type { Word, Topic } from "@/apps/hotaru/types";
import "./../css/hotaru.sass";

const store = useHotaruLibraryStore();
const userStore = useHotaruUserStore();
const router = useRouter();
const route = useRoute();

const loading = ref(true);
const selected = ref<string | null>(null);

// The screen is one accordion: Lessons / Topics / Quick, one region open at a
// time (calm-is-the-manner — never two expanded walls at once). Quick Practice
// is the primary action, so it starts expanded.
type Section = "quick" | "lessons" | "topics";
const openSection = ref<Section | null>("quick");

function toggleSection(s: Section): void {
  openSection.value = openSection.value === s ? null : s;
}

// Practice-your-way choices (Story 2.4): recognition vs production, and how to
// score. Typed scoring is EN→JP-only, so JP→EN forces it back to self-grade.
// Shared by Quick Practice and a chosen scope — but only one Direction/Scoring
// control is ever mounted at a time (openSection gates them), so their testids
// never collide.
type Direction = "r2m" | "m2r";
type ScoringMode = "self" | "typed";
const direction = ref<Direction>("r2m");
const mode = ref<ScoringMode>("self");

// Lessons available as scopes — the empty lesson (un-filed custom words) is not
// a practisable scope.
const lessonScopes = computed(() => store.lessons.filter((l) => l !== ""));

// --- Familiarity aggregation (client-side) --------------------------------
// The page already holds every word + all familiarity; aggregating locally lets
// the all-words ramp and a selected scope's stats coexist, and drops the async
// per-scope `overview` call. The same source the Quick count uses.
const TIER_LABELS = ["New", "Learning", "Familiar", "Strong", "Mastered"];

function tiersOf(words: Word[]): number[] {
  const t = [0, 0, 0, 0, 0];
  for (const w of words) {
    const tier = Math.min(4, Math.max(0, store.familiarityTier(w.id)));
    t[tier] += 1;
  }
  return t;
}

function dominant(tiers: number[]): string {
  let best = 0;
  let idx = 0;
  tiers.forEach((count, i) => {
    if (count > best) {
      best = count;
      idx = i;
    }
  });
  return TIER_LABELS[idx];
}

function segStyle(count: number, total: number): { width: string } {
  return { width: total > 0 ? `${(count / total) * 100}%` : "0%" };
}

const allTiers = computed(() => tiersOf(store.words));
const allCount = computed(() => store.words.length);
const allDominant = computed(() => dominant(allTiers.value));

function lessonWords(l: string): Word[] {
  return store.words.filter((w) => w.lesson === l);
}
function topicWords(t: Topic): Word[] {
  return store.words.filter((w) => t.word_ids.includes(w.id));
}

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

// Collapsed-card one-liner: what tapping Start would launch.
const quickSummary = computed(() => {
  const preset =
    FAMILIARITY_PRESETS.find((p) => p.key === quickPreset.value)?.label ?? "";
  const dir = direction.value === "r2m" ? "JP→EN" : "EN→JP";
  const scoring = mode.value === "self" ? "self-grade" : "typed";
  const count =
    countValue.value > 0 ? `${countValue.value} words` : "all words";
  return `${preset} · ${dir} · ${scoring} · ${count}`;
});

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
  // Tapping the open row again closes its drawer; otherwise open the scope's
  // section and select it.
  if (selected.value === scope) {
    selected.value = null;
    return;
  }
  selected.value = scope;
  openSection.value = scope.startsWith("topic:") ? "topics" : "lessons";
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
  loading.value = false;
  // If we arrived back from a *scoped* drill (?scope=lesson:… / topic:…),
  // re-open that scope so its freshly-reloaded stats are in view without
  // re-tapping the row. A Quick session returns ?scope=all — that's not a row,
  // so we ignore it and leave Quick Practice expanded (the default).
  const scope = route.query.scope;
  if (
    typeof scope === "string" &&
    (scope.startsWith("lesson:") || scope.startsWith("topic:"))
  ) {
    select(scope);
  }
});
</script>

<style scoped lang="sass">
.practice-title
  font-size: 22px
  font-weight: 600
  color: var(--hotaru-cream)

.practice-state
  color: var(--hotaru-cream-soft)
  text-align: center
  padding: 24px 0

// Ambient familiarity across the whole library — a single compact ramp bar.
.practice-ramp
  display: flex
  flex-direction: column
  gap: 6px
  margin-bottom: 14px

.practice-ramp__bar
  display: flex
  height: 10px
  border-radius: 6px
  overflow: hidden
  border: 1px solid rgba(155, 107, 255, 0.16)

.practice-ramp__seg
  height: 100%

.practice-ramp__cap
  font-size: 12px
  color: var(--hotaru-sage)

.practice-ramp__cap b
  color: var(--hotaru-cream-soft)
  font-weight: 600

// Tier fills, tiers 0..4 → --hotaru-fam-1..5 (matches FamiliarityIcon).
.fam-seg--0
  background: var(--hotaru-fam-1)
.fam-seg--1
  background: var(--hotaru-fam-2)
.fam-seg--2
  background: var(--hotaru-fam-3)
.fam-seg--3
  background: var(--hotaru-fam-4)
.fam-seg--4
  background: var(--hotaru-fam-5)

// Chevron rotates when its region is open.
.practice-chev
  color: var(--hotaru-sage)
  font-size: 14px
  transition: transform 0.2s ease

.practice-qcard.is-open .practice-chev, .practice-sec.is-open .practice-chev
  transform: rotate(90deg)

// Quick Practice — primary action; a collapsible cyan-edged card.
.practice-qcard
  border: 1px solid rgba(56, 240, 230, 0.4)
  border-radius: 14px
  background: rgba(56, 240, 230, 0.06)
  margin-bottom: 12px

.practice-qcard__head
  width: 100%
  display: flex
  align-items: center
  gap: 10px
  padding: 12px 14px
  background: transparent
  border: none
  cursor: pointer
  text-align: left

.practice-qcard__icon
  width: 30px
  height: 30px
  flex: none
  display: grid
  place-items: center
  border-radius: 9px
  color: var(--hotaru-bamboo-on)
  background: linear-gradient(160deg, #6ff5ec, var(--hotaru-bamboo))
  box-shadow: 0 0 12px rgba(56, 240, 230, 0.45)

.practice-qcard__meta
  flex: 1
  min-width: 0
  display: flex
  flex-direction: column

.practice-qcard__title
  font-size: 15px
  font-weight: 600
  color: var(--hotaru-cream)

.practice-qcard__sub
  font-size: 12px
  color: var(--hotaru-sage)
  margin-top: 2px

.practice-qcard__body
  padding: 0 14px 14px

// Section headers (Lessons / Topics) — a hued glyph badge + a count pill; the
// hue distinguishes the two families (violet = lessons, magenta = topics).
.practice-sec
  width: 100%
  display: flex
  align-items: center
  gap: 10px
  padding: 10px 13px
  margin-bottom: 8px
  border: 1px solid rgba(155, 107, 255, 0.28)
  border-radius: 12px
  background: linear-gradient(180deg, rgba(155, 107, 255, 0.10), rgba(155, 107, 255, 0.02))
  cursor: pointer
  color: var(--hotaru-cream)
  transition: border-color 0.18s ease, box-shadow 0.18s ease

.practice-sec:hover
  border-color: rgba(155, 107, 255, 0.5)

.practice-sec.is-open
  box-shadow: 0 0 18px rgba(155, 107, 255, 0.18)

.practice-sec__icon
  width: 30px
  height: 30px
  flex: none
  display: grid
  place-items: center
  border-radius: 9px
  color: #0b0620
  background: linear-gradient(160deg, var(--hotaru-fam-2), #6f45d6)
  box-shadow: 0 0 12px rgba(155, 107, 255, 0.4)

.practice-sec__title
  flex: 1
  text-align: left
  font-size: 14px
  font-weight: 600

.practice-sec__count
  font-size: 11px
  font-weight: 600
  color: var(--hotaru-cream-soft)
  background: rgba(155, 107, 255, 0.18)
  border-radius: 9999px
  padding: 1px 8px
  font-variant-numeric: tabular-nums

// Topics wear the magenta accent.
.practice-sec--topics
  border-color: rgba(255, 92, 200, 0.26)
  background: linear-gradient(180deg, rgba(255, 92, 200, 0.10), rgba(255, 92, 200, 0.02))

.practice-sec--topics:hover
  border-color: rgba(255, 92, 200, 0.5)

.practice-sec--topics.is-open
  box-shadow: 0 0 18px rgba(255, 92, 200, 0.18)

.practice-sec--topics .practice-sec__icon
  background: linear-gradient(160deg, var(--hotaru-fam-5), #c23d97)
  box-shadow: 0 0 12px rgba(255, 92, 200, 0.4)

.practice-sec--topics .practice-sec__count
  background: rgba(255, 92, 200, 0.18)

.practice-secbody
  display: flex
  flex-direction: column
  gap: 6px
  margin-bottom: 12px

// A scope row — badge + label + mini-ramp + count pill.
.practice-row
  width: 100%
  display: flex
  align-items: center
  gap: 10px
  padding: 8px 10px
  border: 1px solid rgba(155, 107, 255, 0.14)
  border-radius: 10px
  background: rgba(20, 18, 52, 0.45)
  cursor: pointer
  color: var(--hotaru-cream)
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.12s ease

.practice-row:hover
  transform: translateY(-1px)
  border-color: rgba(155, 107, 255, 0.4)

.practice-row:hover .practice-row__chev
  transform: translateX(2px)

.practice-row--on
  border-color: var(--hotaru-bamboo)
  background: rgba(56, 240, 230, 0.09)
  box-shadow: 0 0 16px rgba(56, 240, 230, 0.20)

.practice-row__badge
  width: 26px
  height: 26px
  flex: none
  display: grid
  place-items: center
  border-radius: 8px
  font-size: 11px
  color: var(--hotaru-fam-2)
  background: rgba(155, 107, 255, 0.14)
  border: 1px solid rgba(155, 107, 255, 0.28)

.practice-row--topics .practice-row__badge
  color: var(--hotaru-fam-5)
  background: rgba(255, 92, 200, 0.12)
  border-color: rgba(255, 92, 200, 0.28)

// Crafted glyphs sit a touch smaller than their badge.
.practice-sec__icon .scope-icon, .practice-qcard__icon .scope-icon
  width: 18px
  height: 18px

.practice-row__badge .scope-icon
  width: 16px
  height: 16px

.practice-row__name
  flex: 1
  min-width: 0
  font-size: 13px
  font-weight: 500
  text-align: left
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis

.practice-row__mini
  display: flex
  width: 40px
  height: 6px
  border-radius: 3px
  overflow: hidden
  flex: none
  background: rgba(255, 255, 255, 0.05)
  box-shadow: inset 0 0 0 1px rgba(155, 107, 255, 0.12)

.practice-row__mini span
  height: 100%

.practice-row__count
  font-size: 11px
  color: var(--hotaru-cream-soft)
  background: rgba(255, 255, 255, 0.05)
  border-radius: 9999px
  padding: 1px 7px
  font-variant-numeric: tabular-nums

.practice-row__chev
  color: var(--hotaru-sage)
  font-size: 13px
  transition: transform 0.16s ease

@media (prefers-reduced-motion: reduce)
  .practice-sec, .practice-row, .practice-row__chev, .practice-chev
    transition: none
  .practice-row:hover
    transform: none

// The per-row actions drawer.
.practice-drawer
  display: flex
  flex-direction: column
  gap: 12px
  padding: 10px 4px 6px

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

.quick__count
  font-size: 14px
  color: var(--hotaru-cream-soft)

// Zero matches → magenta, signalling the (disabled) CTA won't start anything.
.quick__count--empty
  color: var(--hotaru-fam-5)

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
