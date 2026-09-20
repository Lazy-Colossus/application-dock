<template>
  <q-page class="shared-notes-note q-pa-md">
    <div class="text-h5" data-testid="note-id">{{ noteId }}</div>
  </q-page>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const noteId = computed(() => String(route.params.noteId ?? ""));
</script>
