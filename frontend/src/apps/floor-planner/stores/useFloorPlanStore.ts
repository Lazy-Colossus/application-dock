import { ref } from "vue";
import { defineStore } from "pinia";
import { api, ApiError } from "@/composables/useApi";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Apartment } from "../types";

const BASE = "/floor-planner/apartment";

function message(e: unknown): string {
  if (e instanceof ApiError && e.detail) return e.detail;
  return e instanceof Error ? e.message : String(e);
}

export const useFloorPlanStore = defineStore("floor-planner", () => {
  const apartment = ref<Apartment | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  /** Someone else's write won; the view was reloaded. Not an error. */
  const notice = ref<string | null>(null);

  async function fetchApartment(): Promise<void> {
    loading.value = true;
    try {
      apartment.value = await api.get<Apartment>(BASE);
      error.value = null;
    } catch (e) {
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  /** Every write returns the whole apartment; a rejected one refetches so the view reconverges. */
  async function write(call: () => Promise<Apartment>): Promise<boolean> {
    loading.value = true;
    try {
      apartment.value = await call();
      error.value = null;
      notice.value = null;
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        notice.value = `${e.detail}, reloaded`;
        error.value = null;
      } else {
        error.value = message(e);
      }
      try {
        apartment.value = await api.get<Apartment>(BASE);
      } catch {
        // The write's message is already shown; a failed refetch adds nothing.
      }
      return false;
    } finally {
      loading.value = false;
    }
  }

  const baseRev = () => ({ base_rev: apartment.value?.rev ?? 0 });

  const lock = () =>
    write(() => api.post<Apartment>(`${BASE}/lock`, baseRev()));
  const unlock = () =>
    write(() => api.post<Apartment>(`${BASE}/unlock`, baseRev()));
  const addMember = (username: string) =>
    write(() => api.post<Apartment>(`${BASE}/members`, { username }));
  const removeMember = (username: string) =>
    write(() =>
      api.del<Apartment>(`${BASE}/members/${encodeURIComponent(username)}`),
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

  function dismissNotice(): void {
    notice.value = null;
  }

  return {
    apartment,
    loading,
    error,
    notice,
    fetchApartment,
    lock,
    unlock,
    addMember,
    removeMember,
    leave,
    fetchRoster,
    dismissNotice,
  };
});
