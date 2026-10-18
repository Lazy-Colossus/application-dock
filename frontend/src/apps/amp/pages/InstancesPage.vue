<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { storeToRefs } from "pinia";
import { useAmpStore } from "@/apps/amp/stores/useAmpStore";

const store = useAmpStore();
const { instances, loading, error } = storeToRefs(store);

const POLL_MS = 60_000;
let timer: ReturnType<typeof setInterval> | undefined;

function statusColor(state: string): string {
  switch (state) {
    case "Running":
      return "positive";
    case "Starting":
    case "Restarting":
    case "Configuring":
    case "Pre-start":
      return "info";
    case "Sleeping":
    case "Preparing for sleep":
    case "Waiting":
      return "warning";
    case "Failed":
      return "negative";
    default:
      return "grey";
  }
}

onMounted(() => {
  void store.fetch();
  timer = setInterval(() => void store.fetch(), POLL_MS);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <q-page padding>
    <div class="row items-center q-mb-md">
      <div class="text-h5">AMP Instances</div>
      <q-space />
      <q-btn
        flat
        round
        icon="refresh"
        :loading="loading"
        aria-label="Refresh"
        @click="store.fetch()"
      />
    </div>

    <q-banner v-if="error" class="bg-negative text-white q-mb-md" rounded>
      {{ error }}
    </q-banner>

    <q-list v-if="instances.length" bordered separator>
      <q-item v-for="inst in instances" :key="inst.id">
        <q-item-section>
          <q-item-label>{{ inst.name }}</q-item-label>
          <q-item-label caption>
            {{ inst.module }}
            <span v-if="inst.active_users !== null">
              · {{ inst.active_users
              }}<span v-if="inst.max_users">/{{ inst.max_users }}</span> players
            </span>
          </q-item-label>
        </q-item-section>

        <q-item-section side>
          <q-chip :color="statusColor(inst.state)" text-color="white" dense>
            {{ inst.state }}
          </q-chip>
        </q-item-section>

        <q-item-section side>
          <q-btn
            color="primary"
            label="Start"
            dense
            :disable="inst.running || store.isStarting(inst.id)"
            :loading="store.isStarting(inst.id)"
            @click="store.start(inst.id)"
          />
        </q-item-section>
      </q-item>
    </q-list>

    <div v-else-if="!loading && !error" class="text-grey text-center q-pa-xl">
      No AMP instances found.
    </div>
  </q-page>
</template>
