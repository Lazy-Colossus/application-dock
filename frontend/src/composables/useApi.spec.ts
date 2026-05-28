import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api } from '@/composables/useApi';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetch(impl: (...args: Parameters<typeof fetch>) => Promise<Response>): void {
  globalThis.fetch = vi.fn(impl) as unknown as typeof fetch;
}

describe('useApi', () => {
  it('parses 2xx JSON body for GET', async () => {
    mockFetch(async () => new Response(JSON.stringify([{ id: 'archery' }]), { status: 200 }));
    const result = await api.get<Array<{ id: string }>>('/apps');
    expect(result).toEqual([{ id: 'archery' }]);
  });

  it('returns undefined for 204 No Content', async () => {
    mockFetch(async () => new Response(null, { status: 204 }));
    const result = await api.del('/sessions/in-progress');
    expect(result).toBeUndefined();
  });

  it('throws ApiError with .status and .detail on 4xx', async () => {
    mockFetch(
      async () =>
        new Response(JSON.stringify({ detail: 'A session is already in progress.' }), {
          status: 409
        })
    );
    await expect(api.post('/sessions', { archers: ['A'] })).rejects.toMatchObject({
      status: 409,
      detail: 'A session is already in progress.'
    });
  });

  it('throws ApiError(0, ...) on network failure', async () => {
    mockFetch(async () => {
      throw new Error('boom');
    });
    let caught: unknown;
    try {
      await api.get('/anything');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(0);
  });

  it('falls back to statusText when error body lacks detail', async () => {
    mockFetch(async () => new Response('Server fell over', { status: 500, statusText: 'BORK' }));
    await expect(api.get('/anything')).rejects.toMatchObject({
      status: 500,
      detail: 'BORK'
    });
  });
});
