import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { ApiError } from "@/composables/useApi";
import { apps } from "@/apps/registry";

const TOKEN_KEY = "auth_token";

interface TokenResponse {
  access_token: string;
  token_type: string;
}

export const useAuthStore = defineStore("auth", () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const username = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  /** Ids of the apps this user may open; null until loaded, or if loading failed. */
  const appIds = ref<string[] | null>(null);

  const isAuthenticated = computed(() => token.value !== null);

  function messageFrom(e: unknown): string {
    return e instanceof ApiError
      ? e.detail
      : e instanceof Error
        ? e.message
        : String(e);
  }

  async function login(user: string, password: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      // Import lazily to avoid circular dependency with useApi
      const { api } = await import("@/composables/useApi");
      const data = await api.post<TokenResponse>("/auth/login", {
        username: user,
        password,
      });
      token.value = data.access_token;
      username.value = user;
      localStorage.setItem(TOKEN_KEY, data.access_token);
    } catch (e) {
      error.value = messageFrom(e);
    } finally {
      loading.value = false;
    }
  }

  function logout(): void {
    token.value = null;
    username.value = null;
    appIds.value = null;
    localStorage.removeItem(TOKEN_KEY);
  }

  async function restoreSession(): Promise<void> {
    if (!token.value || username.value !== null) return;
    try {
      const { api } = await import("@/composables/useApi");
      const data = await api.get<{ username: string }>("/auth/me");
      username.value = data.username;
    } catch {
      // 401 handled by useApi (logout + redirect); other errors are non-fatal
    }
  }

  /** Once per login; the backend lists only the apps this user may use. */
  async function loadApps(): Promise<void> {
    if (!token.value || appIds.value !== null) return;
    try {
      const { api } = await import("@/composables/useApi");
      appIds.value = (await api.get<{ id: string }[]>("/apps")).map(
        (a) => a.id,
      );
    } catch {
      // Show every card; the backend still refuses an app this user can't use.
    }
  }

  function canOpen(id: string): boolean {
    return appIds.value === null || appIds.value.includes(id);
  }

  /** False for a path inside an app this user may not open. */
  function canVisit(path: string): boolean {
    const app = apps.find(
      (a) => path === a.route || path.startsWith(`${a.route}/`),
    );
    return !app || canOpen(app.id);
  }

  return {
    token,
    username,
    loading,
    error,
    isAuthenticated,
    login,
    logout,
    restoreSession,
    appIds,
    loadApps,
    canOpen,
    canVisit,
  };
});
