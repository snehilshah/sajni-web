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
