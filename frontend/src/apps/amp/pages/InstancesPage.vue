<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
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
// After a start, AMP can briefly still report "Stopped"; refresh quickly a few
// times so the row flips to "Starting…" without waiting for the slow poll.
const START_REFRESH_MS = [2_000, 5_000, 10_000];
let timer: ReturnType<typeof setInterval> | undefined;
let startTimers: ReturnType<typeof setTimeout>[] = [];

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

// Only a stopped (or failed) instance can be started; everything else is already
// up, coming up, or otherwise busy — so Start stays disabled, which also stops it
// being clicked repeatedly while AMP spins the instance up.
const STARTABLE_STATES = ["Stopped", "Failed"];
// States AMP reports while an instance is coming online — drives the "Starting…"
// label so the user can see their click took effect.
const STARTING_STATES = ["Pre-start", "Configuring", "Starting", "Restarting"];

function canStart(inst: AmpInstance): boolean {
  return STARTABLE_STATES.includes(inst.state);
}

function isTransitioning(inst: AmpInstance): boolean {
  return STARTING_STATES.includes(inst.state);
}

// Instances we've started and not yet seen leave the startable state. Starting an
// already-online instance returns instantly, before AMP reports the transition,
// so without this the button would briefly look clickable again — this keeps it
// busy from click until the row actually moves.
const pending = ref<string[]>([]);

function isPending(id: string): boolean {
  return pending.value.includes(id);
}

function prunePending(): void {
  // Drop the optimistic marker once the row shows a non-startable (transitioning
  // or running) state — the real status then drives the button.
  pending.value = pending.value.filter((id) => {
    const inst = instances.value.find((i) => i.id === id);
    return inst != null && canStart(inst);
  });
}

async function startInstance(id: string): Promise<void> {
  const accepted = await store.start(id);
  // On failure, skip the burst so it doesn't immediately wipe the error banner.
  if (!accepted) return;
  if (!pending.value.includes(id)) pending.value.push(id);
  startTimers.forEach(clearTimeout);
  startTimers = START_REFRESH_MS.map((ms, idx) =>
    setTimeout(async () => {
      await store.fetch();
      prunePending();
      // Safety: never leave the row stuck busy if it never transitions.
      if (idx === START_REFRESH_MS.length - 1) {
        pending.value = pending.value.filter((p) => p !== id);
      }
    }, ms),
  );
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
  startTimers.forEach(clearTimeout);
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
            :label="isTransitioning(inst) ? 'Starting…' : 'Start'"
            dense
            data-testid="start"
            :disable="!canStart(inst) || store.isStarting(inst.id) || isPending(inst.id)"
            :loading="store.isStarting(inst.id) || isPending(inst.id)"
            @click="startInstance(inst.id)"
          />
        </q-item-section>
      </q-item>
    </q-list>

    <div v-else-if="!loading && !error" class="text-grey text-center q-pa-xl">
      No AMP instances found.
    </div>
  </q-page>
</template>
