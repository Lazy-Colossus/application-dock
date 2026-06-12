<template>
  <q-layout view="hHh lpR fFf">
    <q-header class="app-bar">
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
          v-else
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
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const showBack = computed(() => route.path !== '/');
const isHome = computed(() => route.path === '/');

const pageTitle = computed(() => {
  const t = route.meta?.title;
  return typeof t === 'string' ? t : '';
});

function goBack(): void {
  if (window.history.length > 1) {
    router.back();
  } else {
    void router.push('/');
  }
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
</style>
