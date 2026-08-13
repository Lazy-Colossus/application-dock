import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { ListSummary, TodoList } from "@/apps/context-switch/types";

export const useContextSwitchStore = defineStore("contextSwitch", () => {
  const lists = ref<ListSummary[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchLists(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      lists.value = await api.get<ListSummary[]>("/context-switch/lists");
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  async function createList(name: string): Promise<TodoList> {
    loading.value = true;
    error.value = null;
    try {
      const created = await api.post<TodoList>("/context-switch/lists", {
        name,
      });
      lists.value.push({
        id: created.id,
        name: created.name,
        active_count: 0,
      });
      return created;
    } catch (e) {
      // Surface the error AND rethrow so the caller can avoid navigating on failure.
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function renameList(listId: string, name: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const updated = await api.put<TodoList>(
        `/context-switch/lists/${listId}`,
        { name },
      );
      const summary = lists.value.find((l) => l.id === listId);
      if (summary) summary.name = updated.name;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function deleteList(listId: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.del(`/context-switch/lists/${listId}`);
      lists.value = lists.value.filter((l) => l.id !== listId);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  return {
    lists,
    loading,
    error,
    fetchLists,
    createList,
    renameList,
    deleteList,
  };
});
