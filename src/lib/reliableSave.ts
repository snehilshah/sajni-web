import { toast } from 'sonner';
import { withPin } from '@/auth/client';
import { failureText } from './errors';
import { retryable } from './retryable';
import { track } from './telemetry';

// Saves that survive a bad connection.
//
// `sendReliably` retries a change that didn't get through (no reply, a reply
// cut off, a 5xx, "still being saved") under one Idempotency-Key, so the API
// runs it once however many copies arrive. A refusal (4xx) isn't retried.
//
// `saveWithGrace` waits briefly for the save. A quick save behaves as before
// (errors reach the caller, so a dialog can stay open). A slow one carries on
// in the background behind a "Saving…" notice, so the user isn't stuck
// waiting on the network.

const ATTEMPT_TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [1_000, 3_000, 8_000, 15_000, 30_000];
const GRACE_MS = 1_500;

type Status = { status?: number; pending?: boolean };

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function waitOnline() {
  if (navigator.onLine) return Promise.resolve();
  return new Promise<void>((resolve) => window.addEventListener('online', () => resolve(), { once: true }));
}

export async function sendReliably<T>(run: () => Promise<T>, key: string = crypto.randomUUID(), label = ''): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const started = performance.now();
    try {
      return await withPin({ key, signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS) }, run);
    } catch (err) {
      const again = retryable(err) && attempt < RETRY_DELAYS_MS.length;
      track('save_retry', {
        label, attempt, again, ms: Math.round(performance.now() - started),
        err: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        status: (err as Status | null)?.status,
      });
      if (!again) throw err;
      await wait(RETRY_DELAYS_MS[attempt]);
      await waitOnline();
    }
  }
}

// Leaving the page while a save is still going would drop it.
let inFlight = 0;
function onUnload(e: BeforeUnloadEvent) { e.preventDefault(); }
function hold() { if (inFlight++ === 0) window.addEventListener('beforeunload', onUnload); }
function release() { if (--inFlight === 0) window.removeEventListener('beforeunload', onUnload); }

interface GraceOptions<T> {
  /** Shown in notices: the task's title. */
  label: string;
  run: () => Promise<T>;
  /** After a successful save (both quick and background). */
  then?: (value: T) => void | Promise<void>;
  /** The save went to the background: show the change now. */
  onBackground?: () => void;
  /** A background save failed for good (after the notice). */
  onFail?: (err: unknown) => void;
}

export async function saveWithGrace<T>(opts: GraceOptions<T>): Promise<void> {
  const key = crypto.randomUUID();
  const job = () => sendReliably(opts.run, key, opts.label).then(async (v) => { await opts.then?.(v); });
  hold();
  const p = job();
  p.then(release, release);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<'slow'>((resolve) => { timer = setTimeout(() => resolve('slow'), GRACE_MS); });
  try {
    if ((await Promise.race([p.then(() => 'done' as const), slow])) === 'done') return;
  } finally {
    clearTimeout(timer);
  }

  track('save_background', { label: opts.label });
  opts.onBackground?.();
  void background(p, opts, job);
}

async function background<T>(p: Promise<void>, opts: GraceOptions<T>, job: () => Promise<void>) {
  const id = toast.loading(`Saving “${opts.label}”…`);
  try {
    await p;
    toast.success(`Saved “${opts.label}”`, { id, duration: 2000 });
  } catch (err) {
    opts.onFail?.(err);
    const again = retryable(err);
    toast.error(again ? `Couldn't save “${opts.label}”. Sajni didn't answer.` : failureText(err, `Couldn't save “${opts.label}”`), {
      id,
      duration: Infinity,
      action: again
        ? {
            label: 'Retry',
            onClick: () => {
              hold();
              const retry = job();
              retry.then(release, release);
              void background(retry, opts, job);
            },
          }
        : undefined,
    });
  }
}
