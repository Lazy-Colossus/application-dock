<template>
  <q-layout view="hHh lpR fFf">
    <q-header class="app-bar" :class="{ 'app-bar--hotaru': inHotaru }">
      <q-toolbar>
        <q-btn
          v-if="showBack"
          flat
          round
          dense
          icon="arrow_back_ios_new"
          color="grey-5"
          :aria-label="'Go back'"
          @click="goBack"
        />
        <q-toolbar-title class="app-bar__title">
          {{ pageTitle }}
        </q-toolbar-title>
        <q-btn
          v-if="authStore.isAuthenticated"
          flat
          round
          dense
          icon="logout"
          color="grey-5"
          aria-label="Log out"
          @click="handleLogout"
        />
        <q-btn
          v-if="isHome"
          flat
          round
          dense
          icon="settings"
          color="primary"
          aria-label="Open settings"
          to="/settings"
        />
        <q-btn
          v-else-if="!hideShellNav"
          flat
          round
          dense
          icon="home"
          color="primary"
          aria-label="Go to apps home"
          to="/"
        />
      </q-toolbar>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/useAuthStore";
import { usePageDetailStore } from "@/stores/usePageDetailStore";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const pageDetail = usePageDetailStore();

// A public link is not a place inside the shell: whoever follows one has no
// account, so the apps home is a dead end and "back" leads out of the app.
const hideShellNav = computed(() => route.meta?.hideShellNav === true);

const showBack = computed(() => route.path !== "/" && !hideShellNav.value);

// Inside the Hotaru app the shell bar adopts Hotaru's dusk field so the header
// reads as part of the app, not a foreign grey chrome strip.
const inHotaru = computed(() => route.path.startsWith("/hotaru"));
const isHome = computed(() => route.path === "/");

const routeTitle = computed(() => {
  const t = route.meta?.title;
  return typeof t === "string" ? t : "";
});

// A page can name what it is showing; the bar then reads "Listies - chuina
// trip" and the app needs no header of its own.
const pageTitle = computed(() =>
  pageDetail.detail
    ? `${routeTitle.value} - ${pageDetail.detail}`
    : routeTitle.value,
);

// Clearing here rather than in each page means a forgotten cleanup cannot
// carry one screen's detail onto the next.
watch(
  () => route.path,
  () => pageDetail.clearDetail(),
);

function goBack(): void {
  if (window.history.length > 1) {
    router.back();
  } else {
    void router.push("/");
  }
}

function handleLogout(): void {
  authStore.logout();
  void router.push("/login");
}
</script>

<style lang="sass" scoped>
.app-bar
  background-color: #1E1E1E
  height: 56px

.app-bar__title
  color: #F0F0F0
  font-weight: 700
  font-size: 18px

// Neon Yūgure: continue the top of Hotaru's radial dusk field (glow → field)
// into the header so the bar blends with the page beneath it.
.app-bar--hotaru
  background: linear-gradient(180deg, #16103c 0%, #0b0a26 100%)

.app-bar--hotaru .app-bar__title
  color: #f1f0ff
</style>
