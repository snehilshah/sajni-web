// A tab can still reference old lazy chunks after a deployment. Reload once
// per entry bundle to pick up fresh HTML, preserving the current route.
const KEY = 'sajni:chunk-reload-build';

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

let pending = false;
let installed = false;

// True once a reload has been kicked off in this page. When the
// vite:preloadError handler swallows the rejection, React.lazy sees an
// undefined module and throws its own error; the boundary uses this to keep
// showing the updating state instead of the error card.
export function isReloadPending(): boolean {
  return pending;
}

// Returns false when recovery is unsafe or already tried for this build,
// so the caller can surface the original error instead of looping.
export function reloadForNewBuild(): boolean {
  if (pending) return true;
  if (!navigator.onLine) return false;

  // The entry hash changes when its lazy import graph changes. Unlike a
  // timeout, this also stops retry loops when a reload takes a long time.
  const build = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src;
  if (!build) return false;
  try {
    if (sessionStorage.getItem(KEY) === build) return false;
    sessionStorage.setItem(KEY, build);
  } catch {
    // Without a persistent marker we cannot bound retries across reloads.
    return false;
  }
  pending = true;
  window.location.reload();
  return true;
}

// Vite fires `vite:preloadError` when a dynamic import or one of its
// preloaded deps fails. preventDefault stops it rethrowing while we reload.
export function installChunkReload() {
  if (installed) return;
  installed = true;
  window.addEventListener('vite:preloadError', (event) => {
    const { payload } = event as Event & { payload: unknown };
    if (isChunkLoadError(payload) && reloadForNewBuild()) event.preventDefault();
  });
}
