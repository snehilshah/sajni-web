import log from '../lib/logger';

// API_BASE is the prefix for backend calls. In dev, the Vite proxy at
// /api forwards to localhost:8080; in prod, set VITE_API_URL to the full
// backend URL (e.g. https://api.sajni.app/api).
export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) || '/api';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

// Public refresh payload — exposes the full /auth/refresh response so
// AuthProvider can adopt the user object in addition to the access token.
// Refresh tokens are *single-use rotating*: each call deletes the row
// on the server and issues a new cookie. Two concurrent calls would
// race and lose the cookie — so all mount-time and 401-retry refreshes
// share a single inflight Promise to dedup them (critical with
// React StrictMode's double-mount in dev).
export interface RefreshResult {
  access_token: string;
  user: {
    id: string;
    email: string;
    name: string;
    onboarded_at: string | null;
    identities: Array<{ provider: 'google' | 'github' | 'email' }>;
    deleted_at?: string | null;
  };
}

let refreshInflight: Promise<RefreshResult | null> | null = null;

export async function refreshSession(): Promise<RefreshResult | null> {
  if (!refreshInflight) {
    refreshInflight = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!res.ok) return null;
        const data = (await res.json()) as RefreshResult;
        accessToken = data.access_token;
        return data;
      } catch {
        return null;
      } finally {
        refreshInflight = null;
      }
    })();
  }
  return refreshInflight;
}

async function refreshAccessToken(): Promise<string | null> {
  const r = await refreshSession();
  return r?.access_token ?? null;
}

interface AuthFetchOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>;
  // skipRefresh prevents the recursive refresh loop after a 401 retry.
  skipRefresh?: boolean;
}

// authFetch is the canonical entry point for backend requests.
//   - prepends API_BASE
//   - sends `Authorization: Bearer` if we have one
//   - on 401 it tries to refresh once and retries
//   - sets Content-Type: application/json by default (callers can override)
export async function authFetch(
  path: string,
  options: AuthFetchOptions = {},
): Promise<Response> {
  const { skipRefresh, headers: callerHeaders, ...rest } = options;
  const headers: Record<string, string> = { ...(callerHeaders || {}) };
  if (rest.body && !(rest.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    credentials: 'include',
    headers,
  });

  if (res.status !== 401 || skipRefresh) return res;

  const fresh = await refreshAccessToken();
  if (!fresh) return res;
  const retryHeaders = { ...headers, Authorization: `Bearer ${fresh}` };
  return fetch(`${API_BASE}${path}`, {
    ...rest,
    credentials: 'include',
    headers: retryHeaders,
  });
}

// requestJSON is the JSON convenience wrapper used by api.ts.
export async function requestJSON<T>(
  path: string,
  options?: AuthFetchOptions,
): Promise<T> {
  const res = await authFetch(path, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const msg = err.error || res.statusText;
    if (res.status >= 500) {
      log.error({ path, status: res.status }, `api error: ${msg}`);
    }
    throw new Error(msg);
  }
  return res.json();
}
