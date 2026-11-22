import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';

import { NAV_ITEMS, isActivePath } from '@/components/nav-chrome';

// Resume where you were, for this session only (sessionStorage: it lasts
// through reloads of this tab or PWA window and ends when it closes).
// Two parts: each space's last address, so the nav returns you to it, and
// page choices (the Tasks list, Finance filters) that live outside the URL.

const PLACE = 'sajni:place:';
const STATE = 'sajni:session:';

// One-shot params: acted on once and cleared by their page (a task to open,
// a media entry to open), never part of where you were.
const ONE_SHOT = ['focus', 'id'];

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* storage off */
  }
}

/** The nav space an address belongs to (Today has nothing to resume). */
function spaceOf(pathname: string): string | null {
  return NAV_ITEMS.find((n) => n.path !== '/' && isActivePath(pathname, n.path))?.path ?? null;
}

/** Called on every route change (Layout). */
export function rememberPlace(pathname: string, search: string) {
  const space = spaceOf(pathname);
  if (!space) return;
  const params = new URLSearchParams(search);
  for (const k of ONE_SHOT) params.delete(k);
  const q = params.toString();
  write(PLACE + space, pathname + (q ? `?${q}` : ''));
}

/**
 * Where a nav item leads: the space's last address this session, or its
 * start. From inside the space it always leads to the start, so tapping the
 * current space's icon is the way back to its first page.
 */
export function placeHref(path: string, currentPathname: string): string {
  if (path === '/' || isActivePath(currentPathname, path)) return path;
  return read(PLACE + path) ?? path;
}

/** useState that lasts for this session (JSON in sessionStorage). */
export function useSessionState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const raw = read(STATE + key);
    if (raw == null) return initial;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });
  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      setValue((cur) => {
        const v = typeof next === 'function' ? (next as (c: T) => T)(cur) : next;
        write(STATE + key, JSON.stringify(v));
        return v;
      });
    },
    [key],
  );
  return [value, set];
}
