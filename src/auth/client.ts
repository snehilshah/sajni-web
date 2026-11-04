import log from '../lib/logger';
import { track } from '../lib/telemetry';

// Both the Vite dev proxy and Vercel rewrite serve the backend at /api.
// Keep auth same-origin so OAuth callbacks and refresh cookies share a host.
// Environment overrides can contain Vercel's literal [SENSITIVE] placeholder
// when production builds run locally after `vercel pull`.
export const API_BASE: string = '/api';

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
    avatar_revision: number;
    identities: Array<{ provider: 'google' | 'github' | 'email' }>;
    deleted_at?: string | null;
  };
}

let refreshInflight: Promise<RefreshResult | null> | null = null;

export async function refreshSession(): Promise<RefreshResult | null> {
  if (!refreshInflight) {
    refreshInflight = (async () => {
      const started = performance.now();
      const done = (outcome: string, status?: number) =>
        track('auth_refresh', { outcome, status, ms: Math.round(performance.now() - started), hadToken: !!accessToken });
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!res.ok) { done('rejected', res.status); return null; }
        const data = (await res.json()) as RefreshResult;
        accessToken = data.access_token;
        done('ok', res.status);
        return data;
      } catch (e) {
        done('error: ' + (e instanceof Error ? e.message : String(e)));
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

// A pin gives the requests started inside `fn` (synchronously, before their
// first await) a fixed Idempotency-Key and an abort signal. Retrying a change
// under the same key is safe: the API runs it once.
interface Pin { key?: string; signal?: AbortSignal }
let pinned: Pin | null = null;

export function withPin<T>(pin: Pin, fn: () => T): T {
  const prev = pinned;
  pinned = pin;
  try { return fn(); } finally { pinned = prev; }
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
  const pin = pinned;
  const { skipRefresh, headers: callerHeaders, ...rest } = options;
  const headers: Record<string, string> = { ...(callerHeaders || {}) };
  if (rest.body && !(rest.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  // A change can reach the server twice: on a stalled connection the browser
  // re-sends it on a fresh one, and the stalled copy may still arrive. The
  // API runs a keyed change once and replays its reply to later copies.
  const method = (rest.method || 'GET').toUpperCase();
  const read = method === 'GET' || method === 'HEAD';
  if (!read && !headers['Idempotency-Key']) {
    headers['Idempotency-Key'] = pin?.key ?? crypto.randomUUID();
  }
  if (!rest.signal && pin?.signal) rest.signal = pin.signal;

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
    // `pending`: the same change is still running on the server; try again soon.
    throw Object.assign(new Error(msg), { status: res.status, pending: res.headers.get('X-Idempotency-Pending') === '1' });
  }
  return res.json();
}
