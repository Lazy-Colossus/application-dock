import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useArcheryHistoryStore } from './useArcheryHistoryStore';
import type { SessionData, SessionSummary } from '@/apps/archery/types';

vi.mock('@/composables/useApi', () => ({
  ApiError: class extends Error {
    status: number;
    detail: string;
    constructor(s: number, d: string) {
      super(`${s}: ${d}`);
      this.status = s;
      this.detail = d;
    }
  },
  api: { get: vi.fn() }
}));

import { api, ApiError } from '@/composables/useApi';

const SUMMARY: SessionSummary = {
  label: '2026-05-29',
  name: '2026-05-29',
  archer_count: 2,
  winner: 'Alice',
  winning_score: 324,
  top_archers: [{ name: 'Alice', score: 324 }]
};

const SESSION: SessionData = {
  label: '2026-05-29',
  name: '2026-05-29',
  date: '2026-05-29',
  created: '2026-05-29T10:00:00Z',
  status: 'finalised',
  archers: ['Alice'],
  targets: []
};

describe('useArcheryHistoryStore — loadHistory', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('populates summaries on success', async () => {
    vi.mocked(api.get).mockResolvedValueOnce([SUMMARY]);
    const store = useArcheryHistoryStore();
    await store.loadHistory();
    expect(store.summaries).toEqual([SUMMARY]);
    expect(store.error).toBeNull();
    expect(store.loading).toBe(false);
  });

  it('sets error on failure', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Network failure'));
    const store = useArcheryHistoryStore();
    await store.loadHistory();
    expect(store.error).toBe('Network failure');
    expect(store.loading).toBe(false);
  });
});

describe('useArcheryHistoryStore — loadDetail', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('populates detail on success', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(SESSION);
    const store = useArcheryHistoryStore();
    await store.loadDetail('2026-05-29');
    expect(store.detail).toEqual(SESSION);
    expect(store.detailError).toBeNull();
    expect(store.detailLoading).toBe(false);
  });

  it('sets detailError on 404 with friendly message', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError(404, 'Not found'));
    const store = useArcheryHistoryStore();
    await store.loadDetail('2026-05-29');
    expect(store.detailError).toContain('not found');
    expect(store.detail).toBeNull();
    expect(store.detailLoading).toBe(false);
  });

  it('sets detailError on generic error', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Server error'));
    const store = useArcheryHistoryStore();
    await store.loadDetail('2026-05-29');
    expect(store.detailError).toBe('Server error');
  });

  it('does not clobber list summaries', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(SESSION);
    const store = useArcheryHistoryStore();
    store.summaries = [SUMMARY];
    await store.loadDetail('2026-05-29');
    expect(store.summaries).toEqual([SUMMARY]);
  });
});
