<template>
  <q-page class="archery-home-page q-pa-md column no-wrap">
    <q-btn
      class="full-width q-mb-sm"
      label="New Session"
      color="accent"
      unelevated
      no-caps
      style="height: 56px; border-radius: 8px"
      data-testid="new-session-btn"
      @click="router.push('/archery/setup')"
    />
    <q-btn
      class="full-width"
      label="History"
      outline
      no-caps
      style="height: 56px; border-radius: 8px; color: var(--color-ink-primary, #F0F0F0)"
      data-testid="history-btn"
      @click="router.push('/archery/history')"
    />
    <!-- Resume / Discard sheet — persistent: backdrop tap does nothing -->
    <q-bottom-sheet v-model="sheetOpen" persistent>
    <div class="resume-sheet q-pt-md q-px-lg q-pb-xl">
      <div class="resume-sheet__handle" />

      <div class="resume-sheet__title text-center q-mb-xs">Session in progress</div>
      <div class="resume-sheet__sub text-center q-mb-lg" data-testid="resume-sub-line">
        {{ subLine }}
      </div>

      <q-btn
        class="full-width q-mb-md resume-sheet__primary"
        label="Resume"
        unelevated
        no-caps
        :disable="store.loading"
        data-testid="resume-btn"
        @click="onResume"
      />
      <q-btn
        class="full-width resume-sheet__secondary"
        label="Start Fresh"
        outline
        no-caps
        :disable="store.loading"
        data-testid="start-fresh-btn"
        @click="onDiscard"
      />
    </div>
  </q-bottom-sheet>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useArcherySessionStore } from '@/apps/archery/stores/useArcherySessionStore';
import { formatSessionLabel } from '@/apps/archery/composables/useSessionLabel';
import type { SessionData } from '@/apps/archery/types';

const router = useRouter();
const store = useArcherySessionStore();

const pendingResume = ref<SessionData | null>(null);
const sheetOpen = ref(false);

onMounted(async () => {
  try {
    const s = await store.checkInProgress();
    pendingResume.value = s;
    if (s) sheetOpen.value = true;
  } catch {
    // non-404 error already set in store.error; don't open sheet
  }
});

const subLine = computed(() => {
  if (!pendingResume.value) return '';
  const count = pendingResume.value.targets.length;
  return `${formatSessionLabel(pendingResume.value.label)} — ${count} of 18 confirmed`;
});

async function onResume() {
  await store.resumeSession();
  void router.push('/archery/scoring');
}

async function onDiscard() {
  await store.discardSession();
  void router.push('/archery/setup');
}
</script>

<style scoped lang="sass">
.archery-home-page
  gap: 12px

.resume-sheet
  background: #1E1E1E
  border-radius: 16px 16px 0 0

.resume-sheet__handle
  width: 32px
  height: 4px
  background: #4A4A4A
  border-radius: 2px
  margin: 0 auto 24px

.resume-sheet__title
  font-size: 20px
  font-weight: 700
  color: #F0F0F0

.resume-sheet__sub
  font-size: 13px
  color: #8A8A8A

.resume-sheet__primary
  height: 56px
  border-radius: 8px
  background: #C8960A
  color: #F0F0F0
  font-size: 16px

.resume-sheet__secondary
  height: 56px
  border-radius: 8px
  color: #F0F0F0
  border-color: #4A4A4A
</style>
