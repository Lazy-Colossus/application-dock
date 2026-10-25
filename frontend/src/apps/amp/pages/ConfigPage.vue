<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { useQuasar } from "quasar";
import { useAmpStore } from "@/apps/amp/stores/useAmpStore";

const store = useAmpStore();
const { instances, loading, error } = storeToRefs(store);
const router = useRouter();
const $q = useQuasar();

// Per-instance port input text, keyed by instance id. Strings because a q-input
// is text; parsed to ints on save.
const draft = ref<Record<string, string>>({});

watch(
  instances,
  () => {
    const next: Record<string, string> = {};
    for (const inst of instances.value) {
      next[inst.id] = inst.port != null ? String(inst.port) : "";
    }
    draft.value = next;
  },
  { immediate: true },
);

onMounted(() => void store.fetch());

async function save(): Promise<void> {
  const ports: Record<string, number> = {};
  for (const [id, text] of Object.entries(draft.value)) {
    const trimmed = text.trim();
    if (!trimmed) continue;
    const value = Number(trimmed);
    // Non-integers are dropped client-side; out-of-range integers are sent so
    // the backend's 1-65535 check can surface a precise error.
    if (Number.isInteger(value)) ports[id] = value;
  }
  await store.savePorts(ports);
  if (store.error) {
    $q.notify({ message: store.error, color: "negative" });
  } else {
    $q.notify({ message: "Ports saved", color: "positive", timeout: 1500 });
  }
}
</script>

<template>
  <q-page padding>
    <div class="row items-center q-mb-md">
      <q-btn flat round icon="arrow_back" aria-label="Back" @click="router.push('/amp')" />
      <div class="text-h5 q-ml-sm">AMP Port Config</div>
      <q-space />
      <q-btn
        color="primary"
        label="Save"
        data-testid="save-ports"
        :loading="loading"
        @click="save()"
      />
    </div>

    <q-banner v-if="error" class="bg-negative text-white q-mb-md" rounded>
      {{ error }}
    </q-banner>

    <q-list v-if="instances.length" bordered separator>
      <q-item v-for="inst in instances" :key="inst.id">
        <q-item-section>
          <q-item-label>{{ inst.name }}</q-item-label>
          <q-item-label caption>{{ inst.module }}</q-item-label>
        </q-item-section>
        <q-item-section side>
          <q-input
            v-model="draft[inst.id]"
            type="number"
            label="Port"
            dense
            :data-testid="`port-${inst.id}`"
          />
        </q-item-section>
      </q-item>
    </q-list>

    <div v-else-if="!loading && !error" class="text-grey text-center q-pa-xl">
      No AMP instances found.
    </div>
  </q-page>
</template>
