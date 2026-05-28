// Single HTTP boundary for the frontend. All stores and components MUST go
// through this; never use raw fetch/axios elsewhere. Backend always returns
// either a JSON value or { detail: "..." } on error — both are surfaced via
// the ApiError contract below.

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly body?: unknown;

  constructor(status: number, detail: string, body?: unknown) {
    super(`${status}: ${detail}`);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.body = body;
  }
}

const BASE_URL = '/api';

type JsonBody = Record<string, unknown> | unknown[] | null;

async function request<T>(method: string, path: string, body?: JsonBody): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (e) {
    // Network failure — no response at all.
    throw new ApiError(0, e instanceof Error ? e.message : 'Network error');
  }

  // 204 No Content — return undefined cast as T (callers using T = void)
  if (response.status === 204) {
    return undefined as T;
  }

  // Parse body once; tolerate empty/non-JSON.
  let parsed: unknown = undefined;
  const raw = await response.text();
  if (raw.length > 0) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
  }

  if (!response.ok) {
    const detail =
      typeof parsed === 'object' &&
      parsed !== null &&
      'detail' in parsed &&
      typeof (parsed as { detail: unknown }).detail === 'string'
        ? (parsed as { detail: string }).detail
        : response.statusText || `HTTP ${response.status}`;
    throw new ApiError(response.status, detail, parsed);
  }

  return parsed as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: JsonBody) => request<T>('POST', path, body ?? null),
  put: <T>(path: string, body?: JsonBody) => request<T>('PUT', path, body ?? null),
  del: <T = void>(path: string) => request<T>('DELETE', path)
};

export default api;
