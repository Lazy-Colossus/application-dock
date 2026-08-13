<template>
  <q-page class="context-switch-app column no-wrap q-pa-md">
    <q-btn
      flat
      no-caps
      icon="arrow_back"
      label="Lists"
      data-testid="back-btn"
      @click="goBack"
    />
    <!-- The board (add todo, grid, pills) is built in Epic 2. This placeholder
         proves the list route resolves with its :listId. -->
    <div class="text-h6 q-mt-md">List</div>
    <div class="text-caption text-grey-6" data-testid="list-id">
      {{ listId }}
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();

const listId = computed(() => String(route.params.listId ?? ""));

function goBack(): void {
  void router.push("/context-switch");
}
</script>
