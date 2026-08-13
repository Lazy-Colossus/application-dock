import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type {
  Grid,
  ListSummary,
  NewTodo,
  Todo,
  TodoList,
  TodoPatch,
} from "@/apps/context-switch/types";

export const useContextSwitchStore = defineStore("contextSwitch", () => {
  const lists = ref<ListSummary[]>([]);
  const currentList = ref<TodoList | null>(null);
  const archived = ref<Todo[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const activeTodos = computed<Todo[]>(() =>
    [...(currentList.value?.todos ?? [])]
      .filter((t) => t.status === "active")
      .sort((a, b) => a.order - b.order),
  );

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

  async function fetchList(listId: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      currentList.value = await api.get<TodoList>(
        `/context-switch/lists/${listId}`,
      );
    } catch (e) {
      currentList.value = null;
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  async function addTodo(listId: string, todo: NewTodo): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const created = await api.post<Todo>(
        `/context-switch/lists/${listId}/todos`,
        { ...todo },
      );
      currentList.value?.todos.push(created);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function updateTodo(
    listId: string,
    todoId: string,
    patch: TodoPatch,
  ): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const updated = await api.put<Todo>(
        `/context-switch/lists/${listId}/todos/${todoId}`,
        { ...patch },
      );
      const todos = currentList.value?.todos ?? [];
      const index = todos.findIndex((t) => t.id === todoId);
      if (index !== -1) todos[index] = updated;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  /** Append a timestamped log entry; the response carries the todo with the new update. */
  async function addUpdate(
    listId: string,
    todoId: string,
    text: string,
  ): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const updated = await api.post<Todo>(
        `/context-switch/lists/${listId}/todos/${todoId}/updates`,
        { text },
      );
      const todos = currentList.value?.todos ?? [];
      const index = todos.findIndex((t) => t.id === todoId);
      if (index !== -1) todos[index] = updated;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  /** Reorder locally first so a drag feels instant; roll back if the POST fails. */
  async function reorderTodos(
    listId: string,
    orderedIds: string[],
  ): Promise<void> {
    const previous = new Map(
      (currentList.value?.todos ?? []).map((t) => [t.id, t.order]),
    );
    orderedIds.forEach((id, index) => {
      const todo = currentList.value?.todos.find((t) => t.id === id);
      if (todo) todo.order = index;
    });

    loading.value = true;
    error.value = null;
    try {
      await api.post(`/context-switch/lists/${listId}/todos/reorder`, {
        ordered_ids: orderedIds,
      });
    } catch (e) {
      for (const todo of currentList.value?.todos ?? []) {
        const order = previous.get(todo.id);
        if (order !== undefined) todo.order = order;
      }
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  /** Load a list's archived todos for the archive view (Story 2.7). */
  async function fetchArchived(listId: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      archived.value = await api.get<Todo[]>(
        `/context-switch/lists/${listId}/archived`,
      );
    } catch (e) {
      archived.value = [];
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  /** Permanently delete an archived todo; drop it locally on success. */
  async function deleteTodo(listId: string, todoId: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.del(`/context-switch/lists/${listId}/todos/${todoId}`);
      archived.value = archived.value.filter((t) => t.id !== todoId);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function setGrid(listId: string, grid: Grid): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const updated = await api.put<TodoList>(
        `/context-switch/lists/${listId}`,
        { grid },
      );
      if (currentList.value) currentList.value.grid = updated.grid;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  return {
    lists,
    currentList,
    archived,
    activeTodos,
    loading,
    error,
    fetchLists,
    createList,
    renameList,
    deleteList,
    fetchList,
    addTodo,
    updateTodo,
    addUpdate,
    fetchArchived,
    deleteTodo,
    reorderTodos,
    setGrid,
  };
});
