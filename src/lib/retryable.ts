/** Worth sending again: the request may not have arrived, or not finished.
 *  No status means no reply at all (TypeError) or our own time limit
 *  (TimeoutError). 409 + X-Idempotency-Pending: the same change is still
 *  running on the server. Other 4xx are refusals. */
export function retryable(err: unknown): boolean {
  const e = err as { status?: unknown; pending?: boolean } | null;
  if (typeof e?.status === 'number') return e.status >= 500 || e.status === 429 || (e.status === 409 && !!e.pending);
  return err instanceof TypeError || (err instanceof DOMException && err.name === 'TimeoutError');
}
