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

  // Switching lists (Story 3.1) can leave two loads in flight; only the newest
  // may write the board, or a slow earlier response lands on top of it and
  // `currentList` ends up describing a list the route has already left.
  let listLoad = 0;

  async function fetchList(listId: string): Promise<void> {
    const load = ++listLoad;
    loading.value = true;
    error.value = null;
    // Blank the board for the duration: the previous list's pills must never
    // linger under the new list's name.
    currentList.value = null;
    try {
      const list = await api.get<TodoList>(`/context-switch/lists/${listId}`);
      if (load !== listLoad) return;
      currentList.value = list;
    } catch (e) {
      if (load !== listLoad) return;
      currentList.value = null;
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      if (load === listLoad) loading.value = false;
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

  /** Move a todo to another list (Story 3.2).
   *
   * Deliberately not optimistic: the pill stays put until the server confirms,
   * so a rejected move never blinks a todo off the board.
   */
  async function moveTodo(
    listId: string,
    todoId: string,
    targetListId: string,
  ): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.post(`/context-switch/lists/${listId}/todos/${todoId}/move`, {
        target_list_id: targetListId,
      });
      // Only the source board loses the pill — by the time this resolves the
      // user may already be looking at the list the todo was moved into.
      if (currentList.value?.id === listId) {
        currentList.value.todos = currentList.value.todos.filter(
          (t) => t.id !== todoId,
        );
      }
      const source = lists.value.find((l) => l.id === listId);
      if (source) source.active_count -= 1;
      const target = lists.value.find((l) => l.id === targetListId);
      if (target) target.active_count += 1;
    } catch (e) {
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
    // The drawer opens before this resolves, so drop the previous list's rows
    // now — otherwise it briefly offers todos belonging to another list.
    archived.value = [];
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

  /** Bring an archived todo back onto the board (Story 3.3).
   *
   * Not `updateTodo`: an archived todo is absent from `currentList.todos`
   * altogether (the board read returns active todos only), so that action's
   * index-replace would silently do nothing. The server decides where it lands.
   */
  async function restoreTodo(listId: string, todoId: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const restored = await api.put<Todo>(
        `/context-switch/lists/${listId}/todos/${todoId}`,
        { status: "active" },
      );
      archived.value = archived.value.filter((t) => t.id !== todoId);
      if (currentList.value?.id === listId) {
        currentList.value.todos.push(restored);
      }
      const summary = lists.value.find((l) => l.id === listId);
      if (summary) summary.active_count += 1;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
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
      // Also drop it from the board's local copy so no deleted "ghost" record
      // lingers in currentList.todos until the next full fetch.
      if (currentList.value) {
        currentList.value.todos = currentList.value.todos.filter(
          (t) => t.id !== todoId,
        );
      }
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
    moveTodo,
    restoreTodo,
    reorderTodos,
    setGrid,
  };
});
