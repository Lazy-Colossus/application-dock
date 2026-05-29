import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useArcherySessionStore } from './useArcherySessionStore';

vi.mock('@/composables/useApi', () => {
  const ApiError = class extends Error {
    status: number;
    detail: string;
    constructor(status: number, detail: string) {
      super(`${status}: ${detail}`);
      this.status = status;
      this.detail = detail;
    }
  };
  return {
    ApiError,
    api: {
      post: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      del: vi.fn()
    }
  };
});

import { api, ApiError } from '@/composables/useApi';
import type { SessionData } from '@/apps/archery/types';

const SESSION_DATA = {
  label: '2026-05-29',
  created: '2026-05-29T10:00:00Z',
  status: 'in_progress' as const,
  archers: ['Alice'],
  targets: []
};

describe('useArcherySessionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('initial state is empty', () => {
    const store = useArcherySessionStore();
    expect(store.session).toBeNull();
    expect(store.draftRoster).toEqual([]);
    expect(store.draftName).toBe('');
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it('createSession sets session on success', async () => {
    vi.mocked(api.post).mockResolvedValueOnce(SESSION_DATA);
    const store = useArcherySessionStore();
    store.draftRoster = ['Alice'];
    await store.createSession();
    expect(store.session).toEqual(SESSION_DATA);
    expect(store.error).toBeNull();
    expect(store.loading).toBe(false);
  });

  it('createSession passes draftRoster as archers', async () => {
    vi.mocked(api.post).mockResolvedValueOnce(SESSION_DATA);
    const store = useArcherySessionStore();
    store.draftRoster = ['Alice', 'Bob'];
    await store.createSession();
    expect(api.post).toHaveBeenCalledWith('/archery/sessions', { archers: ['Alice', 'Bob'] });
  });

  it('createSession sets error on ApiError', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(409, 'A session is already in progress.'));
    const store = useArcherySessionStore();
    store.draftRoster = ['Alice'];
    await store.createSession();
    expect(store.error).toBe('A session is already in progress.');
    expect(store.session).toBeNull();
    expect(store.loading).toBe(false);
  });

  it('createSession sets error on generic Error', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Network failure'));
    const store = useArcherySessionStore();
    store.draftRoster = ['Alice'];
    await store.createSession();
    expect(store.error).toBe('Network failure');
  });

  it('resetDraft clears roster, name, and error', () => {
    const store = useArcherySessionStore();
    store.draftRoster = ['Alice'];
    store.draftName = 'Bob';
    store.error = 'something';
    store.resetDraft();
    expect(store.draftRoster).toEqual([]);
    expect(store.draftName).toBe('');
    expect(store.error).toBeNull();
  });
});

const TARGET_1 = { number: 1, scores: { Alice: [10, 8] as [number, number] } };
const IN_PROGRESS_SESSION: SessionData = {
  label: '2026-05-29',
  created: '2026-05-29T10:00:00Z',
  status: 'in_progress',
  archers: ['Alice'],
  targets: []
};

describe('saveTarget', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('PUTs updated session to /archery/sessions/in-progress', async () => {
    const saved: SessionData = { ...IN_PROGRESS_SESSION, targets: [TARGET_1] };
    vi.mocked(api.put).mockResolvedValueOnce(saved);
    const store = useArcherySessionStore();
    store.session = { ...IN_PROGRESS_SESSION };
    await store.saveTarget(TARGET_1);
    expect(api.put).toHaveBeenCalledWith('/archery/sessions/in-progress', {
      ...IN_PROGRESS_SESSION,
      targets: [TARGET_1]
    });
  });

  it('updates session from server response', async () => {
    const saved: SessionData = { ...IN_PROGRESS_SESSION, targets: [TARGET_1] };
    vi.mocked(api.put).mockResolvedValueOnce(saved);
    const store = useArcherySessionStore();
    store.session = { ...IN_PROGRESS_SESSION };
    await store.saveTarget(TARGET_1);
    expect(store.session).toEqual(saved);
  });

  it('sets error and rethrows on ApiError', async () => {
    vi.mocked(api.put).mockRejectedValueOnce(new ApiError(404, 'No session in progress.'));
    const store = useArcherySessionStore();
    store.session = { ...IN_PROGRESS_SESSION };
    await expect(store.saveTarget(TARGET_1)).rejects.toThrow();
    expect(store.error).toBe('No session in progress.');
    expect(store.loading).toBe(false);
  });

  it('does nothing when session is null', async () => {
    const store = useArcherySessionStore();
    store.session = null;
    await store.saveTarget(TARGET_1);
    expect(api.put).not.toHaveBeenCalled();
  });

  it('clears loading after success', async () => {
    const saved: SessionData = { ...IN_PROGRESS_SESSION, targets: [TARGET_1] };
    vi.mocked(api.put).mockResolvedValueOnce(saved);
    const store = useArcherySessionStore();
    store.session = { ...IN_PROGRESS_SESSION };
    await store.saveTarget(TARGET_1);
    expect(store.loading).toBe(false);
  });
});

describe('checkInProgress', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('returns SessionData on 200', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(IN_PROGRESS_SESSION);
    const store = useArcherySessionStore();
    const result = await store.checkInProgress();
    expect(result).toEqual(IN_PROGRESS_SESSION);
    expect(store.error).toBeNull();
    expect(store.loading).toBe(false);
  });

  it('returns null on 404 without setting error', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError(404, 'No session in progress.'));
    const store = useArcherySessionStore();
    const result = await store.checkInProgress();
    expect(result).toBeNull();
    expect(store.error).toBeNull();
  });

  it('sets error and rethrows on non-404 ApiError', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError(500, 'Internal server error'));
    const store = useArcherySessionStore();
    await expect(store.checkInProgress()).rejects.toThrow();
    expect(store.error).toBeTruthy();
  });
});

describe('discardSession', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('calls DELETE and clears session and draftRoster', async () => {
    vi.mocked(api.del).mockResolvedValueOnce(undefined);
    const store = useArcherySessionStore();
    store.session = { ...IN_PROGRESS_SESSION };
    store.draftRoster = ['Alice'];
    await store.discardSession();
    expect(api.del).toHaveBeenCalledWith('/archery/sessions/in-progress');
    expect(store.session).toBeNull();
    expect(store.draftRoster).toEqual([]);
    expect(store.loading).toBe(false);
  });

  it('sets error on failure but does not rethrow', async () => {
    vi.mocked(api.del).mockRejectedValueOnce(new Error('Network error'));
    const store = useArcherySessionStore();
    store.session = { ...IN_PROGRESS_SESSION };
    await store.discardSession();
    expect(store.error).toBe('Network error');
    expect(store.loading).toBe(false);
  });
});
