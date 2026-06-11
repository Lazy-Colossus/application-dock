<template>
  <q-page class="session-setup-page q-pa-md column no-wrap">
    <!-- Error banner from API -->
    <q-banner v-if="store.error" class="bg-negative text-white q-mb-md" rounded>
      {{ store.error }}
    </q-banner>

    <!-- Session name (Story 6.2) — preloaded with today's date, editable -->
    <q-input
      v-model="store.draftSessionName"
      outlined
      dense
      class="session-setup-page__session-name q-mb-md"
      label="Session name"
      data-testid="session-name-input"
    />

    <div class="text-h5 q-mb-md session-setup-page__heading">Roster</div>

    <!-- Name input row -->
    <div class="row items-start q-gutter-sm q-mb-sm">
      <q-input
        ref="nameInput"
        v-model="store.draftName"
        outlined
        dense
        class="col session-setup-page__input"
        placeholder="Archer name"
        autocapitalize="words"
        :error="!!inputError"
        :error-message="inputError ?? ''"
        data-testid="archer-name-input"
        @keyup.enter="addArcher"
      />
      <q-btn
        class="session-setup-page__add-btn"
        label="Add"
        color="accent"
        unelevated
        no-caps
        style="height: 56px; min-width: 64px"
        data-testid="add-btn"
        @click="addArcher"
      />
      <q-btn
        flat
        no-caps
        label="From list"
        style="height: 56px; color: var(--color-ink-secondary, #9e9e9e)"
        data-testid="picker-btn"
        @click="pickerOpen = !pickerOpen"
      />
    </div>

    <!-- Recurring players picker (Story 8.4) -->
    <div
      v-if="pickerOpen"
      class="recurring-picker column q-gutter-xs q-mb-sm"
      data-testid="recurring-picker"
    >
      <template v-if="recurringStore.players.length === 0">
        <p class="text-caption text-grey-5 q-pa-sm" data-testid="picker-empty-state">
          No recurring players — add some in
          <router-link to="/archery/players" data-testid="picker-manage-link">
            Manage Players
          </router-link>
        </p>
      </template>
      <template v-else-if="availablePlayers.length === 0">
        <p class="text-caption text-grey-5 q-pa-sm" data-testid="picker-all-rostered">
          All recurring players are already in this session's roster.
        </p>
      </template>
      <template v-else>
        <button
          v-for="name in availablePlayers"
          :key="name"
          class="recurring-picker__item"
          data-testid="recurring-player-option"
          @click="pickPlayer(name)"
        >
          {{ name }}
        </button>
      </template>
    </div>

    <!-- Roster list -->
    <div v-if="store.draftRoster.length > 0" class="column q-gutter-sm q-mb-md">
      <ArcherChip
        v-for="name in store.draftRoster"
        :key="name"
        :name="name"
        :removable="true"
        @remove="removeArcher(name)"
      />
    </div>
    <p
      v-else
      class="text-caption text-grey-5 q-mb-md"
      data-testid="empty-state"
    >
      Add at least one archer to start.
    </p>

    <!-- Confirm button -->
    <q-btn
      class="session-setup-page__confirm-btn full-width q-mt-auto"
      label="Confirm Roster"
      color="accent"
      unelevated
      no-caps
      :disable="store.draftRoster.length === 0 || store.loading"
      :loading="store.loading"
      style="height: 56px; border-radius: 8px"
      data-testid="confirm-btn"
      @click="confirmRoster"
    />
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useArcherySessionStore } from '@/apps/archery/stores/useArcherySessionStore';
import { useRecurringPlayersStore } from '@/apps/archery/stores/useRecurringPlayersStore';
import ArcherChip from '@/apps/archery/components/ArcherChip.vue';

const store = useArcherySessionStore();
const recurringStore = useRecurringPlayersStore();
const router = useRouter();
const inputError = ref<string | null>(null);
const nameInput = ref<{ focus?: () => void } | null>(null);
const pickerOpen = ref(false);

const availablePlayers = computed(() =>
  recurringStore.players.filter(
    (n) => !store.draftRoster.some((r) => r.toLowerCase() === n.toLowerCase())
  )
);

// Story 8.1: keep the cursor in the name field so several archers can be
// entered in a row. Re-focus after the re-render (success or rejection).
function focusNameInput(): void {
  void nextTick(() => nameInput.value?.focus?.());
}

onMounted(() => {
  // If a session is already active in the store, go straight to scoring.
  if (store.session !== null) {
    void router.replace('/archery/scoring');
    return;
  }
  // Preload the session name with today's date (Story 6.2). Multiple concurrent
  // sessions are allowed, so we do NOT redirect away when others are in progress.
  // Always reset so direct navigation (bypassing goToSetup) doesn't preserve a stale name.
  store.draftSessionName = new Date().toISOString().slice(0, 10);
  void recurringStore.loadPlayers();
});

// Shared validation for both typed input and picker selection.
function addName(name: string): boolean {
  if (!name) {
    inputError.value = 'Archer name is required.';
    return false;
  }
  if (store.draftRoster.some((r) => r.toLowerCase() === name.toLowerCase())) {
    inputError.value = 'Archer name is already used.';
    return false;
  }
  inputError.value = null;
  store.draftRoster.push(name.toLowerCase());
  return true;
}

function addArcher(): void {
  const name = store.draftName.trim();
  if (addName(name)) {
    store.draftName = '';
  }
  focusNameInput();
}

function pickPlayer(name: string): void {
  if (addName(name)) {
    pickerOpen.value = false;
  }
}

function removeArcher(name: string): void {
  const idx = store.draftRoster.indexOf(name);
  if (idx !== -1) store.draftRoster.splice(idx, 1);
}

async function confirmRoster(): Promise<void> {
  await store.createSession();
  if (!store.error) {
    await router.push('/archery/scoring');
  }
}
</script>

<style scoped lang="sass">
.session-setup-page
  min-height: 100vh

.session-setup-page__heading
  color: var(--color-ink-primary, #F0F0F0)
  font-weight: 700

.session-setup-page__input
  min-height: 56px

.recurring-picker
  background: var(--color-surface-card, #1e1e1e)
  border-radius: 8px
  padding: 8px

.recurring-picker__item
  background: transparent
  border: none
  color: var(--color-ink-primary, #f0f0f0)
  text-align: left
  padding: 10px 12px
  border-radius: 6px
  cursor: pointer
  min-height: 44px
  width: 100%
  text-transform: capitalize
  &:hover
    background: rgba(255, 255, 255, 0.08)
</style>
