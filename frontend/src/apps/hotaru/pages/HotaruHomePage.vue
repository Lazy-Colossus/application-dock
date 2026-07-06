<template>
  <q-page class="hotaru-app column no-wrap q-pa-md">
    <div class="hotaru-topbar row items-center justify-end">
      <AvatarSwitcher />
    </div>

    <div class="hotaru-brand text-center q-mb-xl">
      <div class="hotaru-glyph">蛍</div>
      <div class="hotaru-title">Hotaru</div>
      <div class="hotaru-tagline">
        <template v-if="store.activeUser"
          >Welcome back, {{ store.activeUser.name }}</template
        >
        <template v-else>Japanese vocabulary</template>
      </div>
    </div>

    <q-btn
      class="hotaru-action full-width q-mb-md"
      label="Practice"
      unelevated
      no-caps
      data-testid="practice-btn"
      @click="onPractice"
    />
    <q-btn
      class="hotaru-action full-width"
      label="Library"
      outline
      no-caps
      data-testid="library-btn"
      @click="onLibrary"
    />
  </q-page>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import AvatarSwitcher from "@/apps/hotaru/components/AvatarSwitcher.vue";
import { useHotaruUserStore } from "@/apps/hotaru/stores/useHotaruUserStore";
import "./../css/hotaru.sass";

const store = useHotaruUserStore();
const router = useRouter();

onMounted(async () => {
  if (store.users.length === 0) {
    await store.loadUsers();
  }
  // Entry guard: no one has said who's studying yet.
  if (store.activeUser === null) {
    void router.replace("/hotaru/identity");
  }
});

// Placeholder actions — Practice (Epic 2) and Library (Story 1.4+) pages do not
// exist yet. Wired to real routes in later stories.
function onPractice(): void {
  // TODO(Story 2.2): navigate to the practice picker.
}

function onLibrary(): void {
  // TODO(Story 1.4): navigate to the vocabulary library.
}
</script>

<style scoped lang="sass">
.hotaru-topbar
  min-height: 40px

.hotaru-glyph
  font-size: 56px
  line-height: 1
  color: var(--hotaru-lamp-yellow)
  text-shadow: 0 0 22px rgba(255, 206, 74, 0.6)

.hotaru-title
  font-size: 28px
  font-weight: 600
  margin-top: 8px
  color: var(--hotaru-cream)

.hotaru-tagline
  font-size: 14px
  color: var(--hotaru-cream-soft)

.hotaru-action
  height: 56px
  border-radius: 12px
</style>
