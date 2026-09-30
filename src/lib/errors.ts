export function msg(err: unknown, fallback = 'Unknown error'): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}

export function aborted(err: unknown): boolean {
  if (err instanceof DOMException) return err.name === 'AbortError';
  if (typeof err !== 'object' || err === null || !('name' in err)) return false;
  return (err as { name?: unknown }).name === 'AbortError';
}

/** The server's own message for a 4xx refusal (e.g. "Finish its 2 open
 *  subtasks first"); anything else collapses to the generic fallback. */
export function clientMsg(err: unknown, fallback: string): string {
  const status = (err as { status?: unknown } | null)?.status;
  if (err instanceof Error && typeof status === 'number' && status >= 400 && status < 500) return err.message;
  return fallback;
}
