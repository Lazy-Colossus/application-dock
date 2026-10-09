import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import { useAuthStore } from "@/stores/useAuthStore";
import {
  diff as diffOf,
  needed as neededOf,
  perProjectShortfall,
} from "../shipMath";
import type {
  Grid,
  ProjectDraft,
  ProjectShortfall,
  ResourceId,
  Ship,
  TierId,
} from "../types";

const BASE = "/iss-vanguard/ship";

function message(e: unknown): string {
  if (e && typeof e === "object" && "detail" in e) {
    const detail = (e as { detail: unknown }).detail;
    if (typeof detail === "string" && detail.length > 0) return detail;
  }
  return e instanceof Error ? e.message : String(e);
}

export const useShipStore = defineStore("iss-vanguard-ship", () => {
  const ship = ref<Ship | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const needed = computed<Grid | null>(() =>
    ship.value ? neededOf(ship.value) : null,
  );
  const diff = computed<Grid | null>(() =>
    ship.value ? diffOf(ship.value) : null,
  );
  const shortfalls = computed<ProjectShortfall[]>(() =>
    ship.value ? perProjectShortfall(ship.value) : [],
  );

  async function fetchShip(): Promise<void> {
    loading.value = true;
    try {
      ship.value = await api.get<Ship>(BASE);
      error.value = null;
    } catch (e) {
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  /** A different ship id means the stream now belongs to another ship (moved, reconnected). */
  async function applyRemoteRev(rev: number, shipId: string): Promise<void> {
    if (
      ship.value === null ||
      shipId !== ship.value.id ||
      rev > ship.value.rev
    ) {
      await fetchShip();
    }
  }

  /** Every write returns the whole ship; a rejected one refetches so the view reconverges. */
  async function write(call: () => Promise<Ship>): Promise<boolean> {
    loading.value = true;
    try {
      ship.value = await call();
      error.value = null;
      return true;
    } catch (e) {
      error.value = message(e);
      try {
        ship.value = await api.get<Ship>(BASE);
      } catch {
        // The write's error is already shown; a failed refetch adds nothing.
      }
      return false;
    } finally {
      loading.value = false;
    }
  }

  const adjustStock = (resource: ResourceId, tier: TierId, delta: 1 | -1) =>
    write(() => api.post<Ship>(`${BASE}/stock`, { resource, tier, delta }));
  const createProject = (draft: ProjectDraft) =>
    write(() => api.post<Ship>(`${BASE}/projects`, { ...draft }));
  const updateProject = (id: string, draft: ProjectDraft) =>
    write(() => api.put<Ship>(`${BASE}/projects/${id}`, { ...draft }));
  const deleteProject = (id: string) =>
    write(() => api.del<Ship>(`${BASE}/projects/${id}`));
  const completeProject = (id: string) =>
    write(() => api.post<Ship>(`${BASE}/projects/${id}/complete`));
  const reopenProject = (id: string) =>
    write(() => api.post<Ship>(`${BASE}/projects/${id}/reopen`));
  const addMember = (username: string) =>
    write(() => api.post<Ship>(`${BASE}/members`, { username }));
  const removeMember = (username: string) =>
    write(() =>
      api.del<Ship>(`${BASE}/members/${encodeURIComponent(username)}`),
    );

  async function leave(): Promise<boolean> {
    const me = useAuthStore().username;
    return me ? removeMember(me) : false;
  }

  /** The dock roster for the add field; a failure yields an empty list. */
  async function fetchRoster(): Promise<string[]> {
    try {
      return (await api.get<{ usernames: string[] }>("/auth/users")).usernames;
    } catch (e) {
      error.value = message(e);
      return [];
    }
  }

  return {
    ship,
    loading,
    error,
    needed,
    diff,
    shortfalls,
    fetchShip,
    applyRemoteRev,
    adjustStock,
    createProject,
    updateProject,
    deleteProject,
    completeProject,
    reopenProject,
    addMember,
    removeMember,
    leave,
    fetchRoster,
  };
});
