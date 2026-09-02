<template>
  <q-page class="kdh-calendar column no-wrap q-pa-md">
    <div class="text-h5 q-mb-md">KDH</div>
    <div class="text-grey-6" data-testid="calendar-id">{{ calendarId }}</div>
    <!-- The month view lands in Epic 3; the calendar itself in Story 1.3. -->
  </q-page>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const calendarId = computed(() => String(route.params.calendarId));
</script>
