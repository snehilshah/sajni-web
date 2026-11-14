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
// Events are kept on this device, in IndexedDB (`sajni-diag`, the newest
// 100k events across tabs and reloads). Nothing uploads on a timer. Only
// problems (stuck ≥10 s, errors, "Report slow loading") go to the server right
// away, through POST /api/telemetry into Cloud Logging; a report also sends the
// last 15 minutes of events around it. Settings → Diagnostics uploads the rest
// on request, or downloads it as a file. `sid` + `q` identify an event, so
// duplicates can be dropped.
//
// Every same-origin /api request carries X-Sajni-Req, which the API logs, so
// a stuck request can be matched with the server's view of it.

type Fields = Record<string, unknown>;
interface Ev extends Fields { k: string; q: number; at: number; t: number }

const SID = Math.random().toString(36).slice(2, 10);
const LEGACY_PREFIX = 'sajni:tm:'; // old localStorage buffers, moved into IndexedDB
const SENT_KEY = 'sajni:diag:sent'; // every record up to this key has been uploaded from Settings
const SENT_RANGES_KEY = 'sajni:diag:sentRanges'; // [lo, hi] key ranges above it already uploaded
const DB_NAME = 'sajni-diag';
const STORE = 'ev';
const KEEP = 100_000;
const WRITE_MS = 2_000;
const RECENT = 3_000; // in memory, for a report's context
const REPORT_WINDOW_MS = 15 * 60_000;
const BATCH = 250;
// Settings uploads ride out a connection that stalls (2026-11: Chrome needs
// 10–20 s to give up on a frozen one): a longer wait per batch, then retries.
const SEND_TIMEOUT_MS = 45_000;
const SEND_RETRY_WAITS = [2_000, 5_000, 15_000];
const STUCK_STEPS = [3_000, 10_000, 30_000, 60_000, 120_000, 300_000];
const TELEMETRY_URL = '/api/telemetry';

const BUILD = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
const origFetch: typeof fetch = window.fetch.bind(window);

interface Rec { s: string; b: string; e: Ev }

let seq = 0;
let recent: Ev[] = [];
let toWrite: Rec[] = [];
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let outbox: Ev[] = [];
let sending = false;
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
  recent.push(ev);
  if (recent.length > RECENT) recent = recent.slice(recent.length - RECENT);
  toWrite.push({ s: SID, b: BUILD, e: ev });
  scheduleWrite(urgent ? 0 : WRITE_MS);
  if (urgent) {
    outbox.push(ev);
    if (outbox.length > 200) outbox = outbox.slice(outbox.length - 200);
    setTimeout(() => void sendOutbox(), 0);
  }
}

// ─── On-device store (IndexedDB) ────────────────────────────────────────

let dbp: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { autoIncrement: true });
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); dbp = null; };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('blocked'));
    });
    dbp.catch(() => { dbp = null; });
  }
  return dbp;
}

function done(req: IDBRequest | IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    if ('oncomplete' in req) {
      req.oncomplete = () => resolve();
      req.onabort = req.onerror = () => reject(req.error);
    } else {
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }
  });
}

function result<T>(req: IDBRequest<T>): Promise<T> {
  return done(req).then(() => req.result);
}

function scheduleWrite(delay: number) {
  if (writeTimer !== null) {
    if (delay > 0) return;
    clearTimeout(writeTimer);
  }
  writeTimer = setTimeout(() => void writeOut(), delay);
}

let written = 0;
async function writeOut() {
  writeTimer = null;
  if (toWrite.length === 0) return;
  const batch = toWrite;
  toWrite = [];
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    const st = tx.objectStore(STORE);
    for (const r of batch) st.add(r);
    await done(tx);
    written += batch.length;
    if (written >= 2_000) { written = 0; void prune(); }
  } catch {
    // Storage unavailable or full: these events stay only in memory.
  }
}

// Keep the newest KEEP events.
async function prune() {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    const st = tx.objectStore(STORE);
    const extra = (await result(st.count())) - KEEP;
    if (extra > 0) {
      const keys = await result(st.getAllKeys(null, extra));
      if (keys.length) st.delete(IDBKeyRange.upperBound(keys[keys.length - 1]));
    }
    await done(tx);
  } catch { /* storage unavailable */ }
}

// Buffers from builds that kept them in localStorage move into the store.
function adoptLegacy() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key?.startsWith(LEGACY_PREFIX)) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? 'null') as { build?: string; ev?: Ev[] } | null;
        for (const e of parsed?.ev ?? []) toWrite.push({ s: key.slice(LEGACY_PREFIX.length), b: parsed?.build ?? '?', e });
      } catch { /* corrupt */ }
      localStorage.removeItem(key);
    }
  } catch { /* storage unavailable */ }
}

// ─── Upload ─────────────────────────────────────────────────────────────

async function post(sid: string, build: string, events: Ev[], session: Fields | null, timeoutMs = 20_000): Promise<boolean | 'drop'> {
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
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return true;
    // 4xx (bad batch, rate limit): drop rather than resend forever.
    return res.status >= 400 && res.status < 500 ? 'drop' : false;
  } catch {
    return false;
  }
}

// Problems go up straight away; a failed send waits for the next problem,
// the tab coming back, or the network returning.
async function sendOutbox() {
  if (sending || outbox.length === 0) return;
  sending = true;
  try {
    while (outbox.length > 0) {
      const chunk = outbox.slice(0, BATCH);
      const ok = await post(SID, BUILD, chunk, { ...sessionInfo(), reason: 'problem' });
      if (ok === false) break;
      const sent = new Set(chunk.map((e) => e.q));
      outbox = outbox.filter((e) => !sent.has(e.q));
    }
  } finally {
    sending = false;
  }
}

async function sendRecent(sinceMs: number, reason: string) {
  const events = recent.filter((e) => e.at >= sinceMs);
  for (let i = 0; i < events.length; i += BATCH) {
    if ((await post(SID, BUILD, events.slice(i, i + BATCH), { ...sessionInfo(), reason })) === false) return;
  }
}

// What Settings has uploaded: everything up to `upTo`, plus key ranges above
// it (sends go newest first, so an interrupted send leaves a sent range on top).
interface SentState { upTo: number; ranges: [number, number][] }

function sentState(): SentState {
  try {
    const upTo = Number(localStorage.getItem(SENT_KEY)) || 0;
    const raw: unknown = JSON.parse(localStorage.getItem(SENT_RANGES_KEY) ?? '[]');
    const ranges = Array.isArray(raw)
      ? raw.filter((r): r is [number, number] => Array.isArray(r) && r.length === 2 && typeof r[0] === 'number' && typeof r[1] === 'number' && r[1] > upTo)
      : [];
    return { upTo, ranges };
  } catch {
    return { upTo: 0, ranges: [] };
  }
}

function saveSent(st: SentState) {
  const sorted = [...st.ranges].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [lo, hi] of sorted) {
    const last = merged[merged.length - 1];
    if (last && lo <= last[1] + 1) last[1] = Math.max(last[1], hi);
    else merged.push([lo, hi]);
  }
  let upTo = st.upTo;
  while (merged.length && merged[0][0] <= upTo + 1) upTo = Math.max(upTo, merged.shift()![1]);
  try {
    localStorage.setItem(SENT_KEY, String(upTo));
    if (merged.length) localStorage.setItem(SENT_RANGES_KEY, JSON.stringify(merged));
    else localStorage.removeItem(SENT_RANGES_KEY);
  } catch { /* storage unavailable */ }
}

const isSent = (st: SentState, key: number) => key <= st.upTo || st.ranges.some(([lo, hi]) => key >= lo && key <= hi);

export interface DiagStats { total: number; unsent: number; oldestAt: number | null }

/** Settings → Diagnostics: what's stored on this device. */
export async function diagStats(): Promise<DiagStats> {
  await writeOut();
  const sent = sentState();
  const db = await openDb();
  const st = db.transaction(STORE).objectStore(STORE);
  const [total, above, inRanges, first] = await Promise.all([
    result(st.count()),
    result(st.count(IDBKeyRange.lowerBound(sent.upTo, true))),
    Promise.all(sent.ranges.map(([lo, hi]) => result(st.count(IDBKeyRange.bound(lo, hi))))),
    result(st.openCursor()).then((c) => (c?.value as Rec | undefined)?.e.at ?? null),
  ]);
  return { total, unsent: Math.max(0, above - inRanges.reduce((a, b) => a + b, 0)), oldestAt: first };
}

async function readSince(after: number): Promise<{ keys: number[]; recs: Rec[] }> {
  const db = await openDb();
  const st = db.transaction(STORE).objectStore(STORE);
  const range = after > 0 ? IDBKeyRange.lowerBound(after, true) : undefined;
  const [keys, recs] = await Promise.all([result(st.getAllKeys(range)), result(st.getAll(range))]);
  return { keys: keys as number[], recs: recs as Rec[] };
}

/** One Settings batch, retried when Sajni can't be reached. */
async function postRetrying(rec: Rec, events: Ev[], onRetry: () => void): Promise<boolean | 'drop'> {
  for (let attempt = 0; ; attempt++) {
    const ok = await post(rec.s, rec.b, events, { reason: 'settings', sentBy: SID, ua: navigator.userAgent }, SEND_TIMEOUT_MS);
    if (ok !== false || attempt >= SEND_RETRY_WAITS.length) return ok;
    onRetry();
    await new Promise((r) => setTimeout(r, SEND_RETRY_WAITS[attempt]));
  }
}

export interface DiagSendProgress { sent: number; total: number; retrying: boolean }
export interface DiagSendResult { sent: number; left: number }

/** Upload everything not sent yet, newest first, so the latest problem lands
 *  even if the backlog is cut short. `left` > 0: Sajni couldn't be reached
 *  after retries; what went up is remembered, so Send again carries on. */
export async function sendDiagnostics(progress?: (p: DiagSendProgress) => void): Promise<DiagSendResult> {
  await writeOut();
  const state = sentState();
  const all = await readSince(state.upTo);
  const keys: number[] = [];
  const recs: Rec[] = [];
  all.keys.forEach((k, n) => { if (!isSent(state, k)) { keys.push(k); recs.push(all.recs[n]); } });
  const total = recs.length;
  let sent = 0;
  let j = recs.length;
  while (j > 0) {
    // One batch per tab session, events in order within it.
    let i = j - 1;
    while (i > 0 && j - i < BATCH && recs[i - 1].s === recs[j - 1].s) i--;
    const ok = await postRetrying(recs[i], recs.slice(i, j).map((r) => r.e), () => progress?.({ sent, total, retrying: true }));
    if (ok === false) return { sent, left: total - sent };
    sent += j - i;
    state.ranges.push([keys[i], keys[j - 1]]);
    saveSent(state);
    progress?.({ sent, total, retrying: false });
    j = i;
  }
  // All caught up: everything read is sent, whatever gaps pruning left.
  const top = all.keys[all.keys.length - 1];
  if (top !== undefined) saveSent({ upTo: Math.max(state.upTo, top), ranges: state.ranges.filter(([, hi]) => hi > top) });
  return { sent, left: 0 };
}

/** Save everything stored as a JSON file. */
export async function downloadDiagnostics() {
  await writeOut();
  const { recs } = await readSince(0);
  const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), events: recs })], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sajni-diagnostics-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
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

// ─── Route commits ──────────────────────────────────────────────────────
// The URL changes before React renders the new page. If the old page keeps
// React busy (a render loop) the new page never commits: the URL is right
// but the screen is stuck. Compare the URL with the last committed route.

let urlPath = location.pathname;
let urlChangedAt = performance.now();
let committedPath = location.pathname;
let navStep = 0;

function urlChanged() {
  if (location.pathname === urlPath) return;
  urlPath = location.pathname;
  urlChangedAt = performance.now();
  navStep = 0;
}

/** TelemetryRoute reports each committed route. */
export function routeCommitted(pathname: string) {
  if (navStep > 0 && pathname === urlPath) {
    track('nav_unstuck', { p: pathname, age: Math.round(performance.now() - urlChangedAt) });
  }
  committedPath = pathname;
}

function checkNav() {
  if (committedPath === urlPath) { navStep = 0; return; }
  const age = performance.now() - urlChangedAt;
  while (navStep < STUCK_STEPS.length && age >= STUCK_STEPS[navStep]) {
    const step = STUCK_STEPS[navStep++];
    track('nav_stuck', { url: urlPath, shown: committedPath, step, age: Math.round(age), ...visState(), fetches: pendingSummary() }, true);
  }
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
  checkNav();
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

  for (const method of ['pushState', 'replaceState'] as const) {
    const orig = history[method].bind(history);
    history[method] = (...args: Parameters<History['pushState']>) => { orig(...args); urlChanged(); };
  }
  window.addEventListener('popstate', urlChanged);

  const lifecycle = (name: string, extra?: (e: Event) => Fields) =>
    (e: Event) => track(name, { ...(extra?.(e) ?? {}), ...visState() });

  document.addEventListener('visibilitychange', () => {
    const visible = document.visibilityState === 'visible';
    const hidFor = hiddenSince >= 0 ? now() - Math.round(hiddenSince) : 0;
    if (visible) { lastVisibleAt = performance.now(); hiddenSince = -1; } else { hiddenSince = performance.now(); }
    track(visible ? 'visible' : 'hidden', { hidFor: visible ? hidFor : undefined, pend: pending.size, ...visState() });
    if (visible) void sendOutbox(); else void writeOut();
  });
  window.addEventListener('pagehide', (e) => { track('pagehide', { persisted: e.persisted }); void writeOut(); });
  window.addEventListener('pageshow', (e) => track('pageshow', { persisted: e.persisted, ...visState() }));
  document.addEventListener('freeze', lifecycle('freeze'));
  document.addEventListener('resume', lifecycle('resume'));
  window.addEventListener('online', lifecycle('online'));
  window.addEventListener('online', () => void sendOutbox());
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
            scripts: [...(loaf.scripts ?? [])].sort((a, b) => b.duration - a.duration).slice(0, 3)
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
  adoptLegacy();
  void prune();

  (window as Window & { __sajniTelemetry?: unknown }).__sajniTelemetry = {
    sid: SID, recent: () => recent, pending: () => [...pending.values()], report: reportHang, stats: diagStats,
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
  void sendRecent(Date.now() - REPORT_WINDOW_MS, 'user_report');
}
