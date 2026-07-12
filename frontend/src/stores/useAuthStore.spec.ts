import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// vi.hoisted ensures these are initialised before the hoisted vi.mock factory runs
const { mockPost, mockGet } = vi.hoisted(() => ({
  mockPost: vi.fn(),
  mockGet: vi.fn()
}));

vi.mock('@/composables/useApi', () => ({
  api: { post: mockPost, get: mockGet },
  ApiError: class ApiError extends Error {
    status: number;
    detail: string;
    constructor(status: number, detail: string) {
      super(`${status}: ${detail}`);
      this.name = 'ApiError';
      this.status = status;
      this.detail = detail;
    }
  }
}));

import { useAuthStore } from '@/stores/useAuthStore';

const TOKEN_KEY = 'auth_token';

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('isAuthenticated is false when no token in localStorage', () => {
    const store = useAuthStore();
    expect(store.isAuthenticated).toBe(false);
    expect(store.token).toBeNull();
  });

  it('isAuthenticated is true when token present in localStorage', () => {
    localStorage.setItem(TOKEN_KEY, 'stored-token');
    const store = useAuthStore();
    expect(store.isAuthenticated).toBe(true);
  });

  describe('login', () => {
    it('sets token, username, and localStorage on success', async () => {
      mockPost.mockResolvedValue({ access_token: 'jwt', token_type: 'bearer' });
      const store = useAuthStore();
      await store.login('alice', 'pw');
      expect(store.token).toBe('jwt');
      expect(store.username).toBe('alice');
      expect(store.isAuthenticated).toBe(true);
      expect(localStorage.getItem(TOKEN_KEY)).toBe('jwt');
      expect(store.loading).toBe(false);
      expect(store.error).toBeNull();
    });

    it('sets error and leaves unauthenticated on failure', async () => {
      mockPost.mockRejectedValue(new Error('Invalid credentials'));
      const store = useAuthStore();
      await store.login('alice', 'bad');
      expect(store.error).toBe('Invalid credentials');
      expect(store.isAuthenticated).toBe(false);
      expect(store.loading).toBe(false);
    });

    it('extracts detail from ApiError', async () => {
      const { ApiError } = await import('@/composables/useApi');
      mockPost.mockRejectedValue(new ApiError(401, 'Invalid credentials'));
      const store = useAuthStore();
      await store.login('alice', 'bad');
      expect(store.error).toBe('Invalid credentials');
    });
  });

  describe('logout', () => {
    it('clears token, username, and localStorage', async () => {
      mockPost.mockResolvedValue({ access_token: 'jwt', token_type: 'bearer' });
      const store = useAuthStore();
      await store.login('alice', 'pw');
      store.logout();
      expect(store.token).toBeNull();
      expect(store.username).toBeNull();
      expect(store.isAuthenticated).toBe(false);
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    });
  });

  describe('restoreSession', () => {
    it('populates username from /auth/me when token present', async () => {
      localStorage.setItem(TOKEN_KEY, 'valid-token');
      mockGet.mockResolvedValue({ username: 'alice' });
      const store = useAuthStore();
      await store.restoreSession();
      expect(store.username).toBe('alice');
      expect(mockGet).toHaveBeenCalledWith('/auth/me');
    });

    it('is a no-op when no token', async () => {
      const store = useAuthStore();
      await store.restoreSession();
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('is a no-op when username already populated', async () => {
      localStorage.setItem(TOKEN_KEY, 'valid-token');
      mockGet.mockResolvedValue({ username: 'alice' });
      const store = useAuthStore();
      await store.restoreSession();
      vi.clearAllMocks();
      await store.restoreSession();
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('swallows errors silently without throwing', async () => {
      localStorage.setItem(TOKEN_KEY, 'expired-token');
      mockGet.mockRejectedValue(new Error('Unauthorized'));
      const store = useAuthStore();
      await expect(store.restoreSession()).resolves.toBeUndefined();
    });
  });
});
