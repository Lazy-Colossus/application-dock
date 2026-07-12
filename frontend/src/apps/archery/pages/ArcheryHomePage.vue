<template>
  <q-page class="archery-home-page q-pa-md column no-wrap">
    <q-btn
      class="full-width"
      label="New Session"
      color="accent"
      unelevated
      no-caps
      style="height: 56px; border-radius: 8px"
      data-testid="new-session-btn"
      @click="onNewSession"
    />
    <q-btn
      v-if="todaysInProgress.length > 0"
      class="full-width"
      label="Resume"
      unelevated
      no-caps
      style="height: 56px; border-radius: 8px; background: #c8960a; color: #f0f0f0"
      data-testid="resume-btn"
      @click="onResume"
    />
    <q-btn
      class="full-width"
      label="History"
      outline
      no-caps
      style="height: 56px; border-radius: 8px; color: var(--color-ink-primary, #f0f0f0)"
      data-testid="history-btn"
      @click="router.push('/archery/history')"
    />
    <q-btn
      class="full-width"
      label="Manage Players"
      flat
      no-caps
      style="height: 44px; border-radius: 8px; color: var(--color-ink-secondary, #9e9e9e)"
      data-testid="manage-players-btn"
      @click="router.push('/archery/players')"
    />

    <!-- Error banner (resume/discard failures) -->
    <q-banner v-if="store.error" dense rounded class="bg-negative text-white q-mb-sm">
      {{ store.error }}
    </q-banner>

    <!-- New Session conflict popup (FR-6.4) -->
    <q-dialog v-model="conflictOpen">
      <div class="archery-dialog q-pa-md">
        <p class="q-mb-xs text-h6">Start a new session?</p>
        <p class="q-mb-md text-caption text-grey-5">
          You have {{ store.inProgressList.length }} session(s) in progress.
        </p>
        <div class="column q-gutter-sm">
          <q-btn
            unelevated
            no-caps
            label="Leave them and start new"
            style="background: #c8960a; color: #f0f0f0"
            data-testid="conflict-leave-btn"
            @click="onConflictLeave"
          />
          <q-btn
            outline
            no-caps
            label="Delete in-progress and start new"
            style="color: #f0f0f0"
            data-testid="conflict-delete-btn"
            @click="onConflictDelete"
          />
          <q-btn flat no-caps label="Cancel" @click="conflictOpen = false" />
        </div>
      </div>
    </q-dialog>

    <!-- Resume picker (FR-6.5) — only shown when more than one of today's sessions is open -->
    <q-dialog v-model="pickerOpen">
      <div class="archery-dialog q-pa-md">
        <p class="q-mb-md text-h6">Resume which session?</p>
        <q-list>
          <q-item
            v-for="s in todaysInProgress"
            :key="s.label"
            clickable
            class="archery-picker-row"
            data-testid="resume-picker-row"
            @click="resumeLabel(s.label)"
          >
            <q-item-section>
              <q-item-label>{{ displaySessionName(s) }}</q-item-label>
              <q-item-label caption>{{ s.confirmed_targets }} of 18 confirmed</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </div>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useArcherySessionStore } from '@/apps/archery/stores/useArcherySessionStore';
import { displaySessionName } from '@/apps/archery/composables/useSessionLabel';

const router = useRouter();
const store = useArcherySessionStore();

const conflictOpen = ref(false);
const pickerOpen = ref(false);

const today = new Date().toISOString().slice(0, 10);
const todaysInProgress = computed(() =>
  store.inProgressList.filter((s) => s.date === today)
);

onMounted(() => {
  void store.loadInProgress();
});

function goToSetup() {
  // Start a genuinely fresh session: clear any in-flight session pointer + draft.
  store.session = null;
  store.resetDraft();
  void router.push('/archery/setup');
}

function onNewSession() {
  if (store.inProgressList.length === 0) {
    goToSetup();
  } else {
    conflictOpen.value = true;
  }
}

function onConflictLeave() {
  conflictOpen.value = false;
  goToSetup();
}

async function onConflictDelete() {
  await store.discardAllInProgress();
  conflictOpen.value = false;
  if (!store.error) goToSetup();
}

function onResume() {
  if (todaysInProgress.value.length === 1) {
    void resumeLabel(todaysInProgress.value[0].label);
  } else {
    pickerOpen.value = true;
  }
}

async function resumeLabel(label: string) {
  await store.resumeSession(label);
  if (!store.error) {
    pickerOpen.value = false;
    void router.push('/archery/scoring');
  }
}
</script>

<style scoped lang="sass">
.archery-home-page
  gap: 12px

.archery-dialog
  background: #242424
  border-radius: 8px
  color: #F0F0F0
  min-width: 280px

.archery-picker-row
  border-radius: 8px
  min-height: 56px
  background: #1E1E1E
  margin-bottom: 8px
</style>
