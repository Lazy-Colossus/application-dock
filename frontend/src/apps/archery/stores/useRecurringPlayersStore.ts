import { ref } from 'vue';
import { defineStore } from 'pinia';
import { api } from '@/composables/useApi';

export const useRecurringPlayersStore = defineStore('recurringPlayers', () => {
  const players = ref<string[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function loadPlayers(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      players.value = await api.get<string[]>('/archery/players');
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  async function addPlayer(name: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      players.value = await api.post<string[]>('/archery/players', { name });
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  async function removePlayer(name: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      players.value = await api.del<string[]>(`/archery/players/${encodeURIComponent(name)}`);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  return { players, loading, error, loadPlayers, addPlayer, removePlayer };
});
