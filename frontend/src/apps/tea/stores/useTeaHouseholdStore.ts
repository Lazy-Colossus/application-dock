import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import { useAuthStore } from "@/stores/useAuthStore";
import { useTeaCabinetStore } from "./useTeaCabinetStore";
import { useTeaCatalogueStore } from "./useTeaCatalogueStore";
import { useTeaSessionsStore } from "./useTeaSessionsStore";
import type { Cabinet } from "../types";

function message(e: unknown): string {
  if (e && typeof e === "object" && "detail" in e) {
    const detail = (e as { detail: unknown }).detail;
    if (typeof detail === "string" && detail.length > 0) return detail;
  }
  return e instanceof Error ? e.message : String(e);
}

export const useTeaHouseholdStore = defineStore("tea-household", () => {
  const cabinet = ref<Cabinet | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const shared = computed(() => (cabinet.value?.members?.length ?? 0) > 1);
  /** Everyone in the cabinet but me — who the title and brewer labels name. */
  const others = computed(() =>
    (cabinet.value?.members ?? []).filter((u) => u !== useAuthStore().username),
  );

  async function fetchCabinet(): Promise<void> {
    loading.value = true;
    try {
      cabinet.value = await api.get<Cabinet>("/tea/cabinet");
      error.value = null;
    } catch (e) {
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  /** The dock roster for the add field; a failure yields an empty list. */
  async function fetchRoster(): Promise<string[]> {
    try {
      const data = await api.get<{ usernames: string[] }>("/auth/users");
      return data.usernames;
    } catch (e) {
      error.value = message(e);
      return [];
    }
  }

  async function addMember(username: string): Promise<boolean> {
    loading.value = true;
    try {
      cabinet.value = await api.post<Cabinet>("/tea/cabinet/members", {
        username,
      });
      error.value = null;
      return true;
    } catch (e) {
      error.value = message(e);
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function removeMember(username: string): Promise<boolean> {
    loading.value = true;
    try {
      cabinet.value = await api.del<Cabinet>(
        `/tea/cabinet/members/${encodeURIComponent(username)}`,
      );
      error.value = null;
      return true;
    } catch (e) {
      error.value = message(e);
      return false;
    } finally {
      loading.value = false;
    }
  }

  /** Leaving swaps the whole cabinet under every other tea store, so they all reload. */
  async function leave(): Promise<boolean> {
    const me = useAuthStore().username;
    if (!me || !(await removeMember(me))) return false;
    await Promise.all([
      useTeaCabinetStore().fetchTeas(),
      useTeaCatalogueStore().fetchNodes(true),
      useTeaSessionsStore().fetchInProgress(),
    ]);
    return true;
  }

  return {
    cabinet,
    loading,
    error,
    shared,
    others,
    fetchCabinet,
    fetchRoster,
    addMember,
    removeMember,
    leave,
  };
});
