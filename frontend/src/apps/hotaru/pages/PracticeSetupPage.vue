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

      <q-btn
        v-if="selected !== null"
        class="practice-start full-width q-mt-md"
        label="Let's practice ✦"
        unelevated
        no-caps
        data-testid="start-drill"
        @click="startDrill"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
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

// Lessons available as scopes — the empty lesson (un-filed custom words) is not
// a practisable scope.
const lessonScopes = computed(() => store.lessons.filter((l) => l !== ""));

function select(scope: string): void {
  const user = userStore.activeUserId;
  if (user === null) return;
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
  const q = `scope=${encodeURIComponent(selected.value)}&label=${encodeURIComponent(scopeLabel(selected.value))}`;
  void router.push(`/hotaru/drill?${q}`);
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
  ]);
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

.practice-start
  height: 52px
  border-radius: 14px
  background: linear-gradient(180deg, var(--hotaru-bamboo-bright), var(--hotaru-bamboo))
  color: var(--hotaru-bamboo-on)
  box-shadow: 0 8px 20px rgba(16, 168, 159, 0.4), 0 0 20px rgba(56, 240, 230, 0.22)
</style>
