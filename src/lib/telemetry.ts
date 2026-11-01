import { focusManager, onlineManager, type QueryClient } from '@tanstack/react-query';

// Client diagnostics for the 2026-11 "page stuck loading" investigation.
//
// Records, per tab: every fetch (timings split into queueing, connect, server
// and download, plus the server's Server-Timing), fetches and queries still
// pending past 3/10/30/60/120/300s, TanStack Query pauses/failures and its
// online/focus state, page lifecycle (visibility, freeze/resume, bfcache,
// online/offline, network changes, sleep gaps), main-thread stalls and long
// frames, lazy-chunk loads, auth refreshes, route changes and JS errors.
//
// Events buffer in memory and in localStorage (per tab), and upload in batches
// to POST /api/telemetry, which writes them to Cloud Logging. A tab that dies
// mid-hang (closed, reloaded, killed) leaves its buffer behind; the next tab
// uploads it. `sid` + `q` identify an event, so duplicates can be dropped.
//
// Every same-origin /api request carries X-Sajni-Req, which the API logs, so
// a stuck request can be matched with the server's view of it.

type Fields = Record<string, unknown>;
interface Ev extends Fields { k: string; q: number; at: number; t: number }

const SID = Math.random().toString(36).slice(2, 10);
const KEY_PREFIX = 'sajni:tm:';
const OWN_KEY = KEY_PREFIX + SID;
const MAX_BUF = 3000;
const BATCH = 300;
const ORPHAN_AGE_MS = 2 * 60_000;
const STUCK_STEPS = [3_000, 10_000, 30_000, 60_000, 120_000, 300_000];
const TELEMETRY_URL = '/api/telemetry';

const BUILD = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
const origFetch: typeof fetch = window.fetch.bind(window);

let seq = 0;
let buf: Ev[] = [];
let flushing = false;
let flushFails = 0;
let lastFlushMs = -1;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let getToken: () => string | null = () => null;

let lastVisibleAt = document.visibilityState === 'visible' ? performance.now() : -1;
let hiddenSince = document.visibilityState === 'hidden' ? performance.now() : -1;

const now = () => Math.round(performance.now());
const trim = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);

function errText(e: unknown): string {
  if (e instanceof Error) return trim(`${e.name}: ${e.message}`, 300);
  return trim(String(e), 300);
}

function visState() {
  return {
    vis: document.visibilityState[0], // v | h
    hid: hiddenSince >= 0 ? now() - Math.round(hiddenSince) : 0,
    sinceVis: lastVisibleAt >= 0 ? now() - Math.round(lastVisibleAt) : -1,
    on: navigator.onLine,
  };
}

export function track(k: string, fields: Fields = {}, urgent = false) {
  const ev: Ev = { k, q: ++seq, at: Date.now(), t: now(), ...fields };
  buf.push(ev);
  if (buf.length > MAX_BUF) buf = buf.slice(buf.length - MAX_BUF);
  schedulePersist(urgent ? 0 : 1000);
  if (urgent) setTimeout(() => void flush('urgent'), 0);
}

// ─── Persistence ────────────────────────────────────────────────────────

function persist() {
  persistTimer = null;
  try {
    localStorage.setItem(OWN_KEY, JSON.stringify({ t: Date.now(), build: BUILD, ev: buf }));
  } catch {
    // Quota: keep the newest half and try once more.
    buf = buf.slice(Math.floor(buf.length / 2));
    try { localStorage.setItem(OWN_KEY, JSON.stringify({ t: Date.now(), build: BUILD, ev: buf })); } catch { /* give up */ }
  }
}

function schedulePersist(delay: number) {
  if (persistTimer !== null) {
    if (delay > 0) return;
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(persist, delay);
}

// ─── Upload ─────────────────────────────────────────────────────────────

async function post(sid: string, build: string, events: Ev[], session: Fields | null): Promise<boolean | 'drop'> {
  const body = JSON.stringify({ sid, build, session, events });
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await origFetch(TELEMETRY_URL, {
      method: 'POST',
      body,
      headers,
      keepalive: body.length < 60_000,
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) return true;
    // 4xx (bad batch, rate limit): drop rather than resend forever.
    return res.status >= 400 && res.status < 500 ? 'drop' : false;
  } catch {
    return false;
  }
}

async function flush(reason: string) {
  if (flushing || buf.length === 0) return;
  flushing = true;
  const started = performance.now();
  try {
    while (buf.length > 0) {
      const chunk = buf.slice(0, BATCH);
      const ok = await post(SID, BUILD, chunk, { ...sessionInfo(), reason, flushFails, lastFlushMs });
      if (ok === false) { flushFails++; break; }
      const sent = new Set(chunk.map((e) => e.q));
      buf = buf.filter((e) => !sent.has(e.q));
      persist();
    }
    lastFlushMs = Math.round(performance.now() - started);
  } finally {
    flushing = false;
  }
  void adoptOrphans();
}

let adopting = false;
// Upload buffers left behind by tabs that died (closed, reloaded, killed).
async function adoptOrphans() {
  if (adopting) return;
  adopting = true;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(KEY_PREFIX) || key === OWN_KEY) continue;
      let parsed: { t?: number; build?: string; ev?: Ev[] } | null = null;
      try { parsed = JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { /* corrupt */ }
      if (parsed && typeof parsed.t === 'number' && Date.now() - parsed.t < ORPHAN_AGE_MS) continue; // live tab
      const events = Array.isArray(parsed?.ev) ? parsed.ev : [];
      let ok: boolean | 'drop' = true;
      for (let j = 0; j < events.length && ok !== false; j += BATCH) {
        ok = await post(key.slice(KEY_PREFIX.length), parsed?.build ?? '?', events.slice(j, j + BATCH),
          { orphan: true, adoptedBy: SID });
      }
      if (ok !== false) localStorage.removeItem(key);
    }
  } catch { /* storage unavailable */ } finally {
    adopting = false;
  }
}

// ─── Session context ────────────────────────────────────────────────────

type NetInfo = { type?: string; effectiveType?: string; rtt?: number; downlink?: number; saveData?: boolean };
const conn = (navigator as Navigator & { connection?: NetInfo & EventTarget }).connection;

function netInfo() {
  return conn ? { type: conn.type, eff: conn.effectiveType, rtt: conn.rtt, dl: conn.downlink } : null;
}

function sessionInfo(): Fields {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return {
    ua: navigator.userAgent,
    pwa: window.matchMedia('(display-mode: standalone)').matches,
    vw: window.innerWidth,
    vh: window.innerHeight,
    nav: nav?.type,
    discarded: (document as Document & { wasDiscarded?: boolean }).wasDiscarded ?? null,
    sw: !!navigator.serviceWorker?.controller,
    net: netInfo(),
    upS: Math.round(performance.now() / 1000),
    heapMB: mem ? Math.round(mem.usedJSHeapSize / 1e6) : null,
    path: location.pathname,
  };
}

// ─── Fetch ──────────────────────────────────────────────────────────────

interface PendingFetch {
  id: string;
  m: string;
  u: string;
  abs: string;
  t0: number;
  wall: number;
  start: Fields;
  phase: 'headers' | 'body';
  headersAt?: number;
  res?: Fields;
  step: number;
  done?: boolean;
}

const pending = new Map<string, PendingFetch>();
let fetchCounter = 0;

function shortUrl(abs: string): string {
  try {
    const u = new URL(abs);
    return trim(u.origin === location.origin ? u.pathname + u.search : u.host + u.pathname, 200);
  } catch {
    return trim(abs, 200);
  }
}

function parseServerTiming(h: string | null): Fields {
  if (!h) return {};
  const out: Fields = {};
  for (const part of h.split(',')) {
    const [name, ...params] = part.trim().split(';');
    for (const p of params) {
      const [k, v] = p.trim().split('=');
      if (k === 'dur') out[name] = Number(v);
      if (k === 'desc') out[name] = v?.replace(/"/g, '');
    }
  }
  return out;
}

function finishFetch(p: PendingFetch, extra: Fields) {
  if (p.done) return;
  p.done = true;
  pending.delete(p.id);
  track('fetch', {
    id: p.id, m: p.m, u: p.u, ...p.start, ...p.res,
    h: p.headersAt !== undefined ? Math.round(p.headersAt - p.t0) : undefined,
    ms: now() - Math.round(p.t0),
    ...extra,
  });
}

window.fetch = async function sajniFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const abs = typeof input === 'string' ? new URL(input, location.href).href
    : input instanceof URL ? input.href : input.url;
  if (abs.endsWith(TELEMETRY_URL) || abs.includes('/_vercel/')) return origFetch(input, init);

  const m = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const id = `${SID}-${++fetchCounter}`;
  let nextInit = init;
  const sameOriginApi = abs.startsWith(location.origin + '/api/');
  if (sameOriginApi) {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('X-Sajni-Req', id);
    nextInit = { ...init, headers };
  }
  const p: PendingFetch = {
    id, m, u: shortUrl(abs), abs, t0: performance.now(), wall: Date.now(),
    start: { ...visState(), inflight: pending.size },
    phase: 'headers', step: 0,
  };
  pending.set(id, p);
  try {
    const res = await origFetch(input, nextInit);
    p.headersAt = performance.now();
    p.phase = 'body';
    const st = parseServerTiming(res.headers.get('server-timing'));
    p.res = {
      st: res.status,
      xv: res.headers.get('x-vercel-id') ?? undefined,
      srv: st.app, inst: st.inst, iseq: st.seq, iup: st.up,
      vis1: document.visibilityState[0],
    };
    // The resource-timing entry (when the body has fully arrived) finishes
    // it; non-API and opaque responses may never get one.
    setTimeout(() => finishFetch(p, { rt: null }), 60_000);
    return res;
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    finishFetch(p, { err: errText(e), aborted, vis1: document.visibilityState[0], on1: navigator.onLine });
    throw e;
  }
};

function onResource(entry: PerformanceResourceTiming) {
  if (entry.initiatorType !== 'fetch') return;
  let match: PendingFetch | undefined;
  for (const p of pending.values()) {
    if (p.abs === entry.name && p.phase === 'body' && entry.startTime >= p.t0 - 5 && (!match || p.t0 < match.t0)) match = p;
  }
  if (!match) return;
  const r = (a: number, b: number) => (a > 0 && b > 0 ? Math.round(a - b) : undefined);
  finishFetch(match, {
    rt: {
      proto: entry.nextHopProtocol,
      // Waiting before the request went out: socket pool, stalled H2 stream.
      queue: r(entry.requestStart, entry.startTime),
      dns: r(entry.domainLookupEnd, entry.domainLookupStart),
      conn: r(entry.connectEnd, entry.connectStart),
      ttfb: r(entry.responseStart, entry.requestStart),
      dl: r(entry.responseEnd, entry.responseStart),
      dur: Math.round(entry.duration),
      size: entry.transferSize,
      sw: entry.workerStart > 0,
    },
  });
}

// ─── Watchdogs ──────────────────────────────────────────────────────────

interface QueryWatch { since: number; step: number }
const queryWatch = new Map<string, QueryWatch>();
let client: QueryClient | null = null;

function pendingSummary() {
  return [...pending.values()]
    .sort((a, b) => a.t0 - b.t0)
    .slice(0, 8)
    .map((p) => ({ id: p.id, u: p.u, ph: p.phase, age: now() - Math.round(p.t0) }));
}

function checkFetches() {
  const t = performance.now();
  for (const p of pending.values()) {
    const age = t - p.t0;
    while (p.step < STUCK_STEPS.length && age >= STUCK_STEPS[p.step]) {
      const step = STUCK_STEPS[p.step++];
      track('fetch_stuck', {
        id: p.id, m: p.m, u: p.u, ph: p.phase, step, age: Math.round(age),
        ...p.start, now: visState(), inflight: pending.size, ...(p.res ?? {}),
      }, step >= 10_000);
    }
  }
}

function checkQueries() {
  if (!client) return;
  const t = performance.now();
  const seen = new Set<string>();
  for (const query of client.getQueryCache().getAll()) {
    // Disabled queries (enabled: false) wait on purpose; skip them.
    if (query.getObserversCount() === 0 || query.state.status !== 'pending' || query.isDisabled()) continue;
    const hash = query.queryHash;
    seen.add(hash);
    let w = queryWatch.get(hash);
    if (!w) { w = { since: t, step: 0 }; queryWatch.set(hash, w); }
    const age = t - w.since;
    while (w.step < STUCK_STEPS.length && age >= STUCK_STEPS[w.step]) {
      const step = STUCK_STEPS[w.step++];
      track('query_stuck', {
        key: trim(hash, 160), step, age: Math.round(age),
        fs: query.state.fetchStatus,
        fc: query.state.fetchFailureCount,
        fr: query.state.fetchFailureReason ? errText(query.state.fetchFailureReason) : undefined,
        disabled: query.isDisabled(),
        qOnline: onlineManager.isOnline(),
        qFocus: focusManager.isFocused(),
        ...visState(),
        fetches: pendingSummary(),
      }, step >= 10_000);
    }
  }
  for (const [hash, w] of queryWatch) {
    if (seen.has(hash)) continue;
    queryWatch.delete(hash);
    if (w.step > 0) track('query_unstuck', { key: trim(hash, 160), age: Math.round(t - w.since) });
  }
}

// One ticker: watchdogs, plus main-thread stalls and sleep gaps.
let lastTick = performance.now();
let lastWall = Date.now();
let lastHeartbeat = 0;
function tick() {
  const t = performance.now();
  const wall = Date.now();
  const drift = t - lastTick - 1000;
  const wallDrift = wall - lastWall - (t - lastTick);
  if (document.visibilityState === 'visible' && drift > 2000) {
    track('stall', { ms: Math.round(drift), ...visState() });
  } else if (drift > 60_000) {
    track('gap', { ms: Math.round(drift), ...visState() });
  }
  // performance.now() stops during system sleep in some browsers; Date.now() doesn't.
  if (Math.abs(wallDrift) > 10_000) track('sleep', { wallMs: Math.round(wallDrift), ...visState() });
  lastTick = t;
  lastWall = wall;
  checkFetches();
  checkQueries();
  if (document.visibilityState === 'visible' && t - lastHeartbeat > 60_000) {
    lastHeartbeat = t;
    const active = client?.getQueryCache().getAll().filter((q) => q.getObserversCount() > 0) ?? [];
    track('hb', {
      pend: pending.size,
      qActive: active.length,
      qPending: active.filter((q) => q.state.status === 'pending').length,
      qFetching: active.filter((q) => q.state.fetchStatus === 'fetching').length,
      qPaused: active.filter((q) => q.state.fetchStatus === 'paused').length,
      net: netInfo(),
      heapMB: (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
        ? Math.round((performance as Performance & { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize / 1e6)
        : undefined,
    });
  }
}

// ─── Install ────────────────────────────────────────────────────────────

let installed = false;

/** Call once, early in main.tsx. */
export function installTelemetry(qc: QueryClient, tokenGetter: () => string | null) {
  if (installed) return;
  installed = true;
  client = qc;
  getToken = tokenGetter;

  track('boot', sessionInfo());

  const lifecycle = (name: string, extra?: (e: Event) => Fields) =>
    (e: Event) => track(name, { ...(extra?.(e) ?? {}), ...visState() });

  document.addEventListener('visibilitychange', () => {
    const visible = document.visibilityState === 'visible';
    const hidFor = hiddenSince >= 0 ? now() - Math.round(hiddenSince) : 0;
    if (visible) { lastVisibleAt = performance.now(); hiddenSince = -1; } else { hiddenSince = performance.now(); }
    track(visible ? 'visible' : 'hidden', { hidFor: visible ? hidFor : undefined, pend: pending.size, ...visState() });
    if (!visible) { persist(); void flush('hidden'); }
  });
  window.addEventListener('pagehide', (e) => { track('pagehide', { persisted: e.persisted }); persist(); });
  window.addEventListener('pageshow', (e) => track('pageshow', { persisted: e.persisted, ...visState() }));
  document.addEventListener('freeze', lifecycle('freeze'));
  document.addEventListener('resume', lifecycle('resume'));
  window.addEventListener('online', lifecycle('online'));
  window.addEventListener('offline', lifecycle('offline'));
  window.addEventListener('focus', lifecycle('focus'));
  window.addEventListener('blur', lifecycle('blur'));
  conn?.addEventListener('change', () => track('net', { net: netInfo(), ...visState() }));
  navigator.serviceWorker?.addEventListener('controllerchange', () => track('sw_controller', {}));

  window.addEventListener('error', (e) => track('error', {
    msg: trim(String(e.message), 300), src: e.filename ? shortUrl(e.filename) : undefined, line: e.lineno,
    stack: e.error instanceof Error ? trim(e.error.stack ?? '', 600) : undefined,
  }, true));
  window.addEventListener('unhandledrejection', (e) => track('error', {
    rej: true, msg: errText(e.reason),
    stack: e.reason instanceof Error ? trim(e.reason.stack ?? '', 600) : undefined,
  }, true));

  onlineManager.subscribe((online) => track('q_online', { online, ...visState() }));
  focusManager.subscribe((focused) => track('q_focus', { focused }));

  qc.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated') return;
    const a = event.action.type;
    if (a !== 'error' && a !== 'pause' && a !== 'continue' && a !== 'failed') return;
    const s = event.query.state;
    track('q_' + a, {
      key: trim(event.query.queryHash, 160),
      fc: s.fetchFailureCount,
      err: s.fetchFailureReason ? errText(s.fetchFailureReason) : undefined,
      hasData: s.data !== undefined,
      observers: event.query.getObserversCount(),
      ...visState(),
    }, a === 'error');
  });
  qc.getMutationCache().subscribe((event) => {
    if (event.type !== 'updated') return;
    const a = event.action.type;
    if (a !== 'error' && a !== 'pause' && a !== 'continue' && a !== 'failed') return;
    track('m_' + a, {
      key: trim(JSON.stringify(event.mutation.options.mutationKey ?? null), 120),
      err: event.mutation.state.error ? errText(event.mutation.state.error) : undefined,
      ...visState(),
    });
  });

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) onResource(entry as PerformanceResourceTiming);
    }).observe({ type: 'resource', buffered: true });
  } catch { /* unsupported */ }

  const loafSupported = PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame');
  try {
    if (loafSupported) {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.duration < 400) continue;
          const loaf = e as PerformanceEntry & {
            blockingDuration?: number;
            scripts?: Array<{ sourceURL?: string; invoker?: string; duration: number }>;
          };
          track('long_frame', {
            d: Math.round(e.duration),
            block: Math.round(loaf.blockingDuration ?? 0),
            scripts: (loaf.scripts ?? []).sort((a, b) => b.duration - a.duration).slice(0, 3)
              .map((s) => ({ src: s.sourceURL ? shortUrl(s.sourceURL) : '', inv: trim(s.invoker ?? '', 80), d: Math.round(s.duration) })),
            path: location.pathname,
          });
        }
      }).observe({ type: 'long-animation-frame', buffered: true });
    } else {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.duration >= 400) track('long_task', { d: Math.round(e.duration), path: location.pathname });
        }
      }).observe({ type: 'longtask', buffered: true });
    }
  } catch { /* unsupported */ }

  setInterval(tick, 1000);
  setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) void flush('interval');
  }, 15_000);
  setTimeout(() => void flush('boot'), 5_000);

  (window as Window & { __sajniTelemetry?: unknown }).__sajniTelemetry = {
    sid: SID, buffer: () => buf, pending: () => [...pending.values()], report: reportHang, flush: () => flush('manual'),
  };
}

/** Lazy chunk load timing (lazyPage). */
export function trackChunk(name: string, ms: number, err?: unknown) {
  if (err !== undefined) track('chunk_error', { name, ms, err: errText(err), ...visState() }, true);
  else if (ms >= 3000) track('chunk_slow', { name, ms, ...visState() }, true);
  else if (ms >= 500) track('chunk', { name, ms });
}

/** "Report slow loading" from the command palette: snapshot what's pending. */
export function reportHang() {
  const stuck = client?.getQueryCache().getAll()
    .filter((q) => q.getObserversCount() > 0 && (q.state.status === 'pending' || q.state.fetchStatus !== 'idle'))
    .map((q) => ({ key: trim(q.queryHash, 160), st: q.state.status, fs: q.state.fetchStatus, fc: q.state.fetchFailureCount })) ?? [];
  track('user_report', { path: location.pathname + location.search, fetches: pendingSummary(), queries: stuck, ...visState(), net: netInfo() }, true);
}
