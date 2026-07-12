import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useRecurringPlayersStore } from './useRecurringPlayersStore';

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
  api: { get: vi.fn(), post: vi.fn(), del: vi.fn() }
}));

import { api } from '@/composables/useApi';

describe('useRecurringPlayersStore — loadPlayers', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('populates players on success', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(['Alice', 'Bob']);
    const store = useRecurringPlayersStore();
    await store.loadPlayers();
    expect(store.players).toEqual(['Alice', 'Bob']);
    expect(store.error).toBeNull();
    expect(store.loading).toBe(false);
  });

  it('calls GET /archery/players', async () => {
    vi.mocked(api.get).mockResolvedValueOnce([]);
    const store = useRecurringPlayersStore();
    await store.loadPlayers();
    expect(api.get).toHaveBeenCalledWith('/archery/players');
  });

  it('sets error on failure', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Network error'));
    const store = useRecurringPlayersStore();
    await store.loadPlayers();
    expect(store.error).toBe('Network error');
    expect(store.loading).toBe(false);
  });

  it('toggles loading during request', async () => {
    let resolveFn!: (v: string[]) => void;
    const pending = new Promise<string[]>((r) => { resolveFn = r; });
    vi.mocked(api.get).mockReturnValueOnce(pending);
    const store = useRecurringPlayersStore();
    const p = store.loadPlayers();
    expect(store.loading).toBe(true);
    resolveFn([]);
    await p;
    expect(store.loading).toBe(false);
  });
});

describe('useRecurringPlayersStore — addPlayer', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('calls POST /archery/players and updates players', async () => {
    vi.mocked(api.post).mockResolvedValueOnce(['Alice']);
    const store = useRecurringPlayersStore();
    await store.addPlayer('Alice');
    expect(api.post).toHaveBeenCalledWith('/archery/players', { name: 'Alice' });
    expect(store.players).toEqual(['Alice']);
    expect(store.error).toBeNull();
    expect(store.loading).toBe(false);
  });

  it('sets error on failure', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Server error'));
    const store = useRecurringPlayersStore();
    await store.addPlayer('Alice');
    expect(store.error).toBe('Server error');
    expect(store.loading).toBe(false);
  });

  it('toggles loading during request', async () => {
    let resolveFn!: (v: string[]) => void;
    const pending = new Promise<string[]>((r) => { resolveFn = r; });
    vi.mocked(api.post).mockReturnValueOnce(pending);
    const store = useRecurringPlayersStore();
    const p = store.addPlayer('Alice');
    expect(store.loading).toBe(true);
    resolveFn(['Alice']);
    await p;
    expect(store.loading).toBe(false);
  });
});

describe('useRecurringPlayersStore — removePlayer', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('calls DELETE /archery/players/{name} and updates players', async () => {
    vi.mocked(api.del).mockResolvedValueOnce(['bob']);
    const store = useRecurringPlayersStore();
    store.players = ['alice', 'bob'];
    await store.removePlayer('alice');
    expect(api.del).toHaveBeenCalledWith(`/archery/players/${encodeURIComponent('alice')}`);
    expect(store.players).toEqual(['bob']);
    expect(store.error).toBeNull();
    expect(store.loading).toBe(false);
  });

  it('encodes special characters in the name URL segment', async () => {
    vi.mocked(api.del).mockResolvedValueOnce([]);
    const store = useRecurringPlayersStore();
    await store.removePlayer('alice smith');
    expect(api.del).toHaveBeenCalledWith(`/archery/players/${encodeURIComponent('alice smith')}`);
  });

  it('sets error on failure', async () => {
    vi.mocked(api.del).mockRejectedValueOnce(new Error('Delete failed'));
    const store = useRecurringPlayersStore();
    await store.removePlayer('Alice');
    expect(store.error).toBe('Delete failed');
    expect(store.loading).toBe(false);
  });

  it('toggles loading during request', async () => {
    let resolveFn!: (v: string[]) => void;
    const pending = new Promise<string[]>((r) => { resolveFn = r; });
    vi.mocked(api.del).mockReturnValueOnce(pending);
    const store = useRecurringPlayersStore();
    const p = store.removePlayer('Alice');
    expect(store.loading).toBe(true);
    resolveFn([]);
    await p;
    expect(store.loading).toBe(false);
  });
});
