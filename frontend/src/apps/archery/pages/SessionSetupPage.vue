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
        v-model="store.draftName"
        outlined
        dense
        class="col session-setup-page__input"
        placeholder="Archer name"
        autocapitalize="words"
        :error="!!inputError"
        :error-message="inputError ?? ''"
        @keyup.enter="addArcher"
      />
      <q-btn
        class="session-setup-page__add-btn"
        label="Add"
        color="accent"
        unelevated
        no-caps
        style="height: 56px; min-width: 64px"
        @click="addArcher"
      />
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
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useArcherySessionStore } from '@/apps/archery/stores/useArcherySessionStore';
import ArcherChip from '@/apps/archery/components/ArcherChip.vue';

const store = useArcherySessionStore();
const router = useRouter();
const inputError = ref<string | null>(null);

onMounted(() => {
  // If a session is already active in the store, go straight to scoring.
  if (store.session !== null) {
    void router.replace('/archery/scoring');
    return;
  }
  // Preload the session name with today's date (Story 6.2). Multiple concurrent
  // sessions are allowed, so we do NOT redirect away when others are in progress.
  if (!store.draftSessionName) {
    store.draftSessionName = new Date().toISOString().slice(0, 10);
  }
});

function addArcher(): void {
  const name = store.draftName.trim();
  if (!name) {
    inputError.value = 'Archer name is required.';
    return;
  }
  if (store.draftRoster.includes(name)) {
    inputError.value = 'Archer name is already used.';
    return;
  }
  inputError.value = null;
  store.draftRoster.push(name);
  store.draftName = '';
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
</style>
