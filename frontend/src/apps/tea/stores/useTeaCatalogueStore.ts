import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { AutofillSuggestion, CatalogueNode } from "@/apps/tea/types";

export interface CreateNodeBody {
  parent_id: string;
  name: string;
  name_zh?: string;
  default_origin?: string;
}

function message(e: unknown): string {
  if (e && typeof e === "object" && "detail" in e) {
    const detail = (e as { detail: unknown }).detail;
    if (typeof detail === "string" && detail.length > 0) return detail;
  }
  return e instanceof Error ? e.message : String(e);
}

export const useTeaCatalogueStore = defineStore("tea-catalogue", () => {
  const nodes = ref<CatalogueNode[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  // The tree changes only when this user adds or removes a node, and those
  // paths patch `nodes` themselves — so one fetch per session is enough.
  const loaded = ref(false);

  async function fetchNodes(force = false): Promise<void> {
    if (loaded.value && !force) return;
    loading.value = true;
    try {
      nodes.value = await api.get<CatalogueNode[]>("/tea/catalogue");
      loaded.value = true;
      error.value = null;
    } catch (e) {
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  async function addNode(body: CreateNodeBody): Promise<CatalogueNode | null> {
    loading.value = true;
    try {
      const created = await api.post<CatalogueNode>("/tea/catalogue", { ...body });
      nodes.value = [...nodes.value, created];
      error.value = null;
      return created;
    } catch (e) {
      error.value = message(e);
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function removeNode(nodeId: string): Promise<void> {
    loading.value = true;
    try {
      await api.del(`/tea/catalogue/${nodeId}`);
      nodes.value = nodes.value.filter((node) => node.id !== nodeId);
      error.value = null;
    } catch (e) {
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  // Returns null both when Jev isn't confident (no error — a normal outcome)
  // and when the request itself failed (error.value is set instead).
  async function autofill(name: string): Promise<AutofillSuggestion | null> {
    loading.value = true;
    try {
      const suggestion = await api.post<AutofillSuggestion | null>("/tea/autofill", { name });
      error.value = null;
      return suggestion;
    } catch (e) {
      error.value = message(e);
      return null;
    } finally {
      loading.value = false;
    }
  }

  return { nodes, loading, error, fetchNodes, addNode, removeNode, autofill };
});
