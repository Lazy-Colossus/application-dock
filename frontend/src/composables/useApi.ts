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
  // Lazy import to avoid circular dependency (useAuthStore imports useApi)
  const { useAuthStore } = await import('@/stores/useAuthStore');
  const authStore = useAuthStore();

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (authStore.token) headers['Authorization'] = `Bearer ${authStore.token}`;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (e) {
    // Network failure — no response at all.
    throw new ApiError(0, 'Network error');
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
    const apiError = new ApiError(response.status, detail, parsed);

    // If token was present but server rejected it (expired/invalid), clear and
    // redirect to login. Skip redirect for the login endpoint itself (wrong
    // credentials returns 401 there too) and when no token was present.
    if (response.status === 401 && authStore.token !== null && path !== '/auth/login') {
      authStore.logout();
      window.location.href = '/login';
    }

    throw apiError;
  }

  return parsed as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: JsonBody) => request<T>('POST', path, body),
  put: <T>(path: string, body?: JsonBody) => request<T>('PUT', path, body),
  del: <T = void>(path: string) => request<T>('DELETE', path)
};

export default api;
