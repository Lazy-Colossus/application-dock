import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { AmpInstance } from "@/apps/amp/types";

export const useAmpStore = defineStore("amp", () => {
  const instances = ref<AmpInstance[]>([]);
  const publicIp = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  // Ids with a start request in flight — drives per-row button spinner/disable.
  const starting = ref<string[]>([]);

  function isStarting(id: string): boolean {
    return starting.value.includes(id);
  }

  // The connect address for the copy-link button, or null when it can't be
  // formed (no public IP configured, or no port set for this instance).
  function linkFor(inst: AmpInstance): string | null {
    return publicIp.value && inst.port ? `${publicIp.value}:${inst.port}` : null;
  }

  async function fetch(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      // The public IP is optional: a failed config call just leaves links off,
      // so it must not fail the whole load.
      const [list, config] = await Promise.all([
        api.get<AmpInstance[]>("/amp/instances"),
        api
          .get<{ public_ip: string | null }>("/amp/config")
          .catch(() => ({ public_ip: null })),
      ]);
      instances.value = list;
      publicIp.value = config.public_ip ?? null;
    } catch (e) {
      // A failed poll keeps the last known list rather than blanking the page.
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  async function savePorts(ports: Record<string, number>): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.put("/amp/ports", { ports });
      await fetch();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  // Returns whether the start request was accepted, so the caller can decide
  // whether to kick off follow-up polling (and avoid clearing a failure banner).
  async function start(id: string): Promise<boolean> {
    if (starting.value.includes(id)) return false;
    starting.value.push(id);
    error.value = null;
    try {
      await api.post(`/amp/instances/${id}/start`);
      await fetch();
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      return false;
    } finally {
      starting.value = starting.value.filter((x) => x !== id);
    }
  }

  return {
    instances,
    publicIp,
    loading,
    error,
    starting,
    isStarting,
    linkFor,
    fetch,
    savePorts,
    start,
  };
});
