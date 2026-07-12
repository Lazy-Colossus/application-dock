<template>
  <q-page class="recurring-players-page q-pa-md column no-wrap">
    <q-banner
      v-if="store.error"
      dense
      rounded
      class="bg-negative text-white q-mb-md"
      data-testid="error-banner"
    >
      {{ store.error }}
    </q-banner>

    <div class="text-h5 q-mb-md recurring-players-page__heading">Recurring Players</div>

    <!-- Add player row -->
    <div class="row items-start q-gutter-sm q-mb-sm">
      <q-input
        v-model="newName"
        outlined
        dense
        class="col"
        placeholder="Player name"
        autocapitalize="words"
        :error="!!inputError"
        :error-message="inputError ?? ''"
        data-testid="player-name-input"
        @keyup.enter="addPlayer"
      />
      <q-btn
        label="Add"
        color="accent"
        unelevated
        no-caps
        style="height: 56px; min-width: 64px"
        data-testid="add-btn"
        @click="addPlayer"
      />
    </div>

    <!-- Player list -->
    <div v-if="store.players.length > 0" class="column q-gutter-sm q-mb-md">
      <ArcherChip
        v-for="name in store.players"
        :key="name"
        :name="name"
        :removable="true"
        @remove="onRemove(name)"
      />
    </div>
    <p
      v-else
      class="text-caption text-grey-5 q-mb-md"
      data-testid="empty-state"
    >
      No recurring players yet — add names to reuse them across sessions.
    </p>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRecurringPlayersStore } from '@/apps/archery/stores/useRecurringPlayersStore';
import ArcherChip from '@/apps/archery/components/ArcherChip.vue';

const store = useRecurringPlayersStore();
const newName = ref('');
const inputError = ref<string | null>(null);

onMounted(() => {
  void store.loadPlayers();
});

async function onRemove(name: string): Promise<void> {
  await store.removePlayer(name);
}

async function addPlayer(): Promise<void> {
  const name = newName.value.trim();
  if (!name) {
    inputError.value = 'Player name is required.';
    return;
  }
  if (store.players.includes(name.toLowerCase())) {
    inputError.value = 'Player already in the list.';
    return;
  }
  inputError.value = null;
  await store.addPlayer(name.toLowerCase());
  if (!store.error) {
    newName.value = '';
  }
}
</script>

<style scoped lang="sass">
.recurring-players-page
  min-height: 100vh

.recurring-players-page__heading
  color: var(--color-ink-primary, #F0F0F0)
  font-weight: 700

.column :deep(.archer-chip__name)
  text-transform: capitalize
</style>
