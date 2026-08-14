import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { ApiError } from "@/composables/useApi";

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

  return {
    token,
    username,
    loading,
    error,
    isAuthenticated,
    login,
    logout,
    restoreSession,
  };
});
