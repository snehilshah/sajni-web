// Recovery from lazy-chunk load failures. In the browser two causes look the
// same ("Failed to fetch dynamically imported module"):
//   1. a deploy replaced the build this tab runs, so its old chunks now 404;
//   2. the network dropped or stalled the request (the chunk is fine).
// Both heal with a full reload: a fresh document gets fresh HTML and a fresh
// module map, because browsers remember a failed module fetch per document.
// Reloads are budgeted (MAX_RELOADS per WINDOW_MS, tracked in sessionStorage
// across reloads), so a chunk that is genuinely broken ends on the error card
// instead of looping. A network failure waits a little before reloading, so a
// flaky connection gets a chance to come back.
//
// /version.json (written at build time, see vite.config.ts) says which case
// it is, and lets an idle tab notice a new deploy before anything breaks
// (buildWatch.ts).

const KEY = 'sajni:chunk-reloads';
const MAX_RELOADS = 3;
const WINDOW_MS = 2 * 60_000;

// Browser wording for a failed dynamic import or CSS preload:
// Chrome "Failed to fetch dynamically imported module", Firefox "error loading
// dynamically imported module", Safari "Importing a module script failed",
// Vite "Unable to preload CSS".
const CHUNK_ERROR =
  /dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading (CSS )?chunk/i;

export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  return CHUNK_ERROR.test(msg);
}

/** This bundle's build id; `dev` outside production builds. */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

/** The deployed build id, or null when it can't be read (offline, dev). */
export async function deployedBuild(): Promise<string | null> {
  if (BUILD_ID === 'dev') return null;
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const build = (body as { build?: unknown } | null)?.build;
    return typeof build === 'string' ? build : null;
  } catch {
    return null;
  }
}

let pending = false;
let installed = false;

// True once a reload has been scheduled in this page. When the
// vite:preloadError handler swallows the rejection, React.lazy sees an
// undefined module and throws its own error; the boundary uses this to keep
// showing the updating state instead of the error card.
export function isReloadPending(): boolean {
  return pending;
}

function recentReloads(now: number): number[] | null {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((t): t is number => typeof t === 'number' && now - t < WINDOW_MS) : [];
  } catch {
    return null;
  }
}

/**
 * Start recovering from a chunk failure: reload now if a newer build is
 * deployed, after a short backoff if not (network). Returns false, and does
 * nothing, when recovery is unsafe: offline, storage unavailable (no way to
 * bound retries), or the reload budget is spent. The caller then shows the
 * error card with a manual Retry.
 */
export function startRecovery(): boolean {
  if (pending) return true;
  if (!navigator.onLine) return false;
  const now = Date.now();
  const reloads = recentReloads(now);
  if (reloads === null || reloads.length >= MAX_RELOADS) return false;
  try {
    sessionStorage.setItem(KEY, JSON.stringify([...reloads, now]));
  } catch {
    return false;
  }
  pending = true;
  void deployedBuild().then((deployed) => {
    const stale = deployed !== null && deployed !== BUILD_ID;
    const backoff = stale ? 0 : 1000 * (reloads.length + 1);
    window.setTimeout(() => window.location.reload(), backoff);
  });
  return true;
}

// Vite fires `vite:preloadError` when a dynamic import or one of its
// preloaded deps fails. preventDefault stops it rethrowing while we reload.
export function installChunkReload() {
  if (installed) return;
  installed = true;
  window.addEventListener('vite:preloadError', (event) => {
    const { payload } = event as Event & { payload: unknown };
    if (isChunkLoadError(payload) && startRecovery()) event.preventDefault();
  });
}
