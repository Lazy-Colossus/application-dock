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
        label="Back to library"
        unelevated
        no-caps
        @click="toLibrary"
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
        label="Back to library"
        unelevated
        no-caps
        @click="toLibrary"
      />
    </div>

    <!-- Active drill. -->
    <template v-else-if="current">
      <div class="drill-progress" data-testid="drill-progress">
        {{ progress }}
      </div>

      <div class="col column flex-center">
        <Flashcard :word="current.word" :revealed="revealed" />
      </div>

      <q-btn
        v-if="!revealed"
        class="drill-btn full-width"
        label="Reveal"
        unelevated
        no-caps
        data-testid="reveal-btn"
        @click="reveal"
      />
      <q-btn
        v-else
        class="drill-btn full-width"
        label="Next"
        unelevated
        no-caps
        data-testid="next-btn"
        @click="next"
      />
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import FireflyLayer from "@/apps/hotaru/components/FireflyLayer.vue";
import Flashcard from "@/apps/hotaru/components/Flashcard.vue";
import { useDrill } from "@/apps/hotaru/composables/useDrill";
import { useHotaruPracticeStore } from "@/apps/hotaru/stores/useHotaruPracticeStore";
import { useHotaruUserStore } from "@/apps/hotaru/stores/useHotaruUserStore";
import "./../css/hotaru.sass";

const store = useHotaruPracticeStore();
const userStore = useHotaruUserStore();
const router = useRouter();
const route = useRoute();

const { queue } = storeToRefs(store);
const { total, finished, current, revealed, progress, reveal, next } =
  useDrill(queue);

function toLibrary(): void {
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
    // No scope chosen — send the learner back to the picker.
    void router.replace("/hotaru/practice");
    return;
  }
  await store.loadQueue(scope, userStore.activeUserId);
});
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

.drill-progress
  text-align: center
  font-size: 13px
  color: var(--hotaru-sage)
  margin-bottom: 8px

.drill-btn
  height: 52px
  border-radius: 14px
  background: linear-gradient(180deg, var(--hotaru-bamboo-bright), var(--hotaru-bamboo))
  color: var(--hotaru-bamboo-on)
  box-shadow: 0 8px 20px rgba(16, 168, 159, 0.4), 0 0 20px rgba(56, 240, 230, 0.22)
</style>
