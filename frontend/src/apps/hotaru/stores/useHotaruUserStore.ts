import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { HotaruUser } from "@/apps/hotaru/types";

const STORAGE_KEY = "hotaru.activeUser";

function readPersisted(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writePersisted(id: string | null): void {
  try {
    if (id === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, id);
    }
  } catch {
    // Persistence is best-effort; identity still works in-memory this session.
  }
}

export const useHotaruUserStore = defineStore("hotaruUser", () => {
  const users = ref<HotaruUser[]>([]);
  const activeUserId = ref<string | null>(readPersisted());
  const loading = ref(false);
  const error = ref<string | null>(null);

  const activeUser = computed<HotaruUser | null>(
    () => users.value.find((u) => u.id === activeUserId.value) ?? null,
  );

  async function loadUsers(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      users.value = await api.get<HotaruUser[]>("/hotaru/users");
      // Drop a persisted id that is no longer a known user.
      if (
        activeUserId.value !== null &&
        !users.value.some((u) => u.id === activeUserId.value)
      ) {
        setActiveUser(null);
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  function setActiveUser(id: string | null): void {
    activeUserId.value = id;
    writePersisted(id);
  }

  return {
    users,
    activeUserId,
    loading,
    error,
    activeUser,
    loadUsers,
    setActiveUser,
  };
});
