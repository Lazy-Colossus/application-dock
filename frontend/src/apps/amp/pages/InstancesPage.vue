<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { useQuasar } from "quasar";
import { useAmpStore } from "@/apps/amp/stores/useAmpStore";
import { copyToClipboard } from "@/apps/amp/clipboard";
import type { AmpInstance } from "@/apps/amp/types";

const store = useAmpStore();
const { instances, loading, error, publicIp } = storeToRefs(store);
const router = useRouter();
const $q = useQuasar();

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

async function copyLink(inst: AmpInstance): Promise<void> {
  const link = store.linkFor(inst);
  if (!link) return;
  const ok = await copyToClipboard(link);
  $q.notify(
    ok
      ? { message: "Copied", color: "positive", timeout: 1500 }
      : { message: "Copy failed", color: "negative", timeout: 1500 },
  );
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
        icon="settings"
        aria-label="Configure ports"
        @click="router.push('/amp/config')"
      />
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
            {{ inst.game ?? inst.module }}
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
            flat
            round
            dense
            icon="content_copy"
            aria-label="Copy connect link"
            data-testid="copy-link"
            :disable="!store.linkFor(inst)"
            @click="copyLink(inst)"
          >
            <q-tooltip v-if="!store.linkFor(inst)">
              {{
                publicIp
                  ? "Set a port for this instance in config"
                  : "Set AMP_PUBLIC_IP to enable links"
              }}
            </q-tooltip>
          </q-btn>
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
