<template>
  <q-page class="hotaru-app column no-wrap q-pa-md">
    <FireflyLayer />

    <div v-if="store.loading" class="study-state" data-testid="study-loading">
      Loading…
    </div>
    <div v-else-if="store.error" class="study-state" data-testid="study-error">
      {{ store.error }}
    </div>

    <!-- Nothing to browse in this scope. -->
    <div
      v-else-if="total === 0"
      class="study-state column flex-center"
      data-testid="study-empty"
    >
      <div>Nothing to study here yet.</div>
      <q-btn
        class="study-btn q-mt-md"
        label="Back to library"
        unelevated
        no-caps
        data-testid="study-empty-btn"
        @click="backToLibrary"
      />
    </div>

    <!-- Reached the end. -->
    <div
      v-else-if="finished"
      class="study-state column flex-center"
      data-testid="study-done"
    >
      <div class="study-done__glyph">蛍</div>
      <div>That's all.</div>
      <q-btn
        class="study-btn q-mt-md"
        label="Back to library"
        unelevated
        no-caps
        data-testid="study-done-btn"
        @click="backToLibrary"
      />
    </div>

    <!-- Browsing. -->
    <template v-else-if="current">
      <div class="study-topbar row items-center justify-between q-mb-md">
        <div class="study-scope" data-testid="study-scope">
          <span class="study-glyph">蛍</span> {{ scopeLabel }}
        </div>
        <div class="study-progress" data-testid="study-progress">
          {{ progress }}
        </div>
      </div>

      <div class="study-cardwrap col column">
        <StudyCard
          :word="current.word"
          :notes="current.notes ?? []"
          :users="userStore.users"
          :active-user="userStore.activeUserId ?? undefined"
        />
      </div>

      <q-btn
        class="study-btn full-width q-mt-md"
        label="Next word"
        unelevated
        no-caps
        data-testid="next-word-btn"
        @click="next"
      />
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import FireflyLayer from "@/apps/hotaru/components/FireflyLayer.vue";
import StudyCard from "@/apps/hotaru/components/StudyCard.vue";
import { useDrill } from "@/apps/hotaru/composables/useDrill";
import { useHotaruPracticeStore } from "@/apps/hotaru/stores/useHotaruPracticeStore";
import { useHotaruUserStore } from "@/apps/hotaru/stores/useHotaruUserStore";
import "./../css/hotaru.sass";

const store = useHotaruPracticeStore();
const userStore = useHotaruUserStore();
const router = useRouter();
const route = useRoute();

// The study list is QueueItem[] (word + notes) — reuse the drill's sequence
// machine directly; reveal/grade go unused here (Study is browse-only).
const { study } = storeToRefs(store);
const { total, finished, current, progress, next } = useDrill(study);

// Friendly "what we're studying" label, derived from the scope for deep links.
const scopeLabel = computed(() => {
  const scope = typeof route.query.scope === "string" ? route.query.scope : "";
  return scope.split(":")[1] ?? "";
});

function backToLibrary(): void {
  void router.push("/hotaru/library");
}

onMounted(async () => {
  if (userStore.users.length === 0) await userStore.loadUsers();
  if (userStore.activeUserId === null) {
    void router.replace("/hotaru/identity");
    return;
  }
  const scope = typeof route.query.scope === "string" ? route.query.scope : "";
  if (!scope) {
    void router.replace("/hotaru/practice");
    return;
  }
  await store.loadStudy(scope, userStore.activeUserId);
});
</script>

<style scoped lang="sass">
.study-state
  color: var(--hotaru-cream-soft)
  text-align: center
  padding: 48px 0
  flex: 1
  justify-content: center

// The 蛍 logo glows warm lamp-yellow, as on Home. Not the --hotaru-lamp-yellow
// token: that is aliased to cyan in the neon identity, which would leave a cyan
// glyph wearing this yellow halo.
.study-done__glyph
  font-size: 48px
  color: #ffd24a
  text-shadow: 0 0 26px rgba(255, 210, 74, 0.7)
  margin-bottom: 8px

.study-glyph
  color: var(--hotaru-bamboo)
  text-shadow: 0 0 12px rgba(56, 240, 230, 0.7)
  margin-right: 5px

.study-scope
  font-size: 15px
  font-weight: 600
  color: var(--hotaru-cream)

.study-progress
  font-size: 13px
  color: var(--hotaru-cream-soft)

.study-cardwrap
  display: flex

.study-btn
  height: 52px
  border-radius: 14px
  background: linear-gradient(180deg, var(--hotaru-bamboo-bright), var(--hotaru-bamboo))
  color: var(--hotaru-bamboo-on)
  box-shadow: 0 8px 20px rgba(16, 168, 159, 0.4), 0 0 20px rgba(56, 240, 230, 0.22)
</style>
