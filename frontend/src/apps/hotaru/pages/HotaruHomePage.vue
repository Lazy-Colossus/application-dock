<template>
  <q-page class="hotaru-app column no-wrap q-pa-md">
    <FireflyLayer />
    <div class="hotaru-topbar row items-center justify-end">
      <AvatarSwitcher />
    </div>

    <div class="hotaru-brand text-center q-mb-xl">
      <div class="hotaru-glyph">蛍</div>
      <div class="hotaru-title hotaru-glow">Hotaru</div>
      <div class="hotaru-tagline">
        <template v-if="store.activeUser"
          >Welcome back, {{ store.activeUser.name }}</template
        >
        <template v-else>Japanese vocabulary</template>
      </div>
    </div>

    <q-btn
      class="hotaru-action hotaru-action--primary full-width q-mb-md"
      label="Practice"
      unelevated
      no-caps
      data-testid="practice-btn"
      @click="onPractice"
    />
    <q-btn
      class="hotaru-action hotaru-action--secondary full-width"
      label="Library"
      unelevated
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
import FireflyLayer from "@/apps/hotaru/components/FireflyLayer.vue";
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

function onPractice(): void {
  void router.push("/hotaru/practice");
}

function onLibrary(): void {
  void router.push("/hotaru/library");
}
</script>

<style scoped lang="sass">
.hotaru-topbar
  min-height: 40px

.hotaru-glyph
  font-size: 56px
  line-height: 1
  // The 蛍 logo glows warm lamp-yellow (a firefly against the neon dusk).
  color: #ffd24a
  text-shadow: 0 0 26px rgba(255, 210, 74, 0.75), 0 0 10px rgba(255, 224, 130, 0.6)

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
  border-radius: 14px
  font-size: 16px

.hotaru-action--primary
  background: linear-gradient(180deg, var(--hotaru-bamboo-bright), var(--hotaru-bamboo))
  color: var(--hotaru-bamboo-on)
  box-shadow: 0 8px 20px rgba(16, 168, 159, 0.4), 0 0 20px rgba(56, 240, 230, 0.22)

// Secondary: a low-opacity cyan wash so it reads as related to Practice but
// clearly recedes behind the solid gradient primary.
.hotaru-action--secondary
  background: rgba(56, 240, 230, 0.14)
  color: var(--hotaru-bamboo-bright)
  border: 1px solid rgba(56, 240, 230, 0.4)
</style>
