<template>
  <q-page class="context-switch-app column no-wrap q-pa-md">
    <div class="row items-center justify-between">
      <q-btn
        flat
        no-caps
        icon="arrow_back"
        label="Lists"
        data-testid="back-btn"
        @click="goBack"
      />
      <div class="text-h6" data-testid="list-name">
        {{ store.currentList?.name ?? "" }}
      </div>
      <q-btn
        round
        unelevated
        color="primary"
        icon="add"
        data-testid="add-todo-btn"
        @click="addOpen = true"
      />
    </div>

    <div v-if="store.error" class="text-negative q-mt-md" data-testid="error">
      {{ store.error }}
    </div>

    <div
      v-if="!store.loading && store.activeTodos.length === 0"
      class="text-grey-6 q-mt-lg"
      data-testid="empty-state"
    >
      No todos yet — add your first one with the + button.
    </div>

    <div v-else class="cs-board q-mt-md" data-testid="board">
      <TodoPill v-for="todo in store.activeTodos" :key="todo.id" :todo="todo" />
    </div>

    <AddTodoDialog v-model="addOpen" @create="onCreate" />
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useContextSwitchStore } from "@/apps/context-switch/stores/useContextSwitchStore";
import AddTodoDialog from "@/apps/context-switch/components/AddTodoDialog.vue";
import TodoPill from "@/apps/context-switch/components/TodoPill.vue";
import type { NewTodo } from "@/apps/context-switch/types";

const route = useRoute();
const router = useRouter();
const store = useContextSwitchStore();

const listId = computed(() => String(route.params.listId ?? ""));
const addOpen = ref(false);

onMounted(() => {
  void store.fetchList(listId.value);
});

function goBack(): void {
  void router.push("/context-switch");
}

async function onCreate(todo: NewTodo): Promise<void> {
  try {
    await store.addTodo(listId.value, todo);
  } catch {
    // Surfaced via store.error.
  }
}
</script>

<style scoped lang="sass">
.cs-board
  display: grid
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))
  gap: 16px
</style>
