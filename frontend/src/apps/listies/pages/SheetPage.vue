<template>
  <q-page class="listies-sheet q-pa-md">
    <div class="text-h5 q-mb-md">Sheet {{ sheetId }}</div>
  </q-page>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const sheetId = computed(() => String(route.params.sheetId ?? ""));
</script>
