import { toast } from 'sonner';

import { aborted, failureText, networkFailure } from './errors';
import { isChunkLoadError } from './chunkReload';

// Safety net for action handlers that `await` an API call without a catch
// (deletes, toggles, one-off buttons). Before this, a refused request just
// died in the console and the UI looked unresponsive. Only API failures
// (they carry `status`) and lost connections surface; anything else is a
// bug for the error boundary/logs, not a toast. 401 is the auth flow's job.
export function installErrorNet() {
  window.addEventListener('unhandledrejection', (event) => {
    const reason: unknown = event.reason;
    if (aborted(reason) || isChunkLoadError(reason)) return;
    const status = (reason as { status?: unknown } | null)?.status;
    if (typeof status === 'number') {
      if (status === 401) return;
    } else if (!networkFailure(reason)) {
      return;
    }
    event.preventDefault();
    const text = failureText(reason);
    // Same text → one toast, even if a caller also reported it.
    toast.error(text, { id: text });
  });
}
