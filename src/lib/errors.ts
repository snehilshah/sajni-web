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

/** True when the request never reached the server (offline, DNS, CORS).
 *  Browsers word it differently: "Failed to fetch", "NetworkError…", "Load failed". */
export function networkFailure(err: unknown): boolean {
  return err instanceof TypeError && /fetch|network|load failed/i.test(err.message);
}

/** What a failed action tells the user: the server's own words for a 4xx,
 *  a connection hint when nothing landed, the fallback otherwise. */
export function failureText(err: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (networkFailure(err)) return "Couldn't reach Sajni. Check your connection.";
  return clientMsg(err, fallback);
}
