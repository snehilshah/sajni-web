import { useEffect, useState } from 'react';

// Docked Sajni (desktop): width bounds, the remembered width, and whether
// there's room to push the page aside.
export const DOCK_MIN = 320;
export const DOCK_MAX = 560;
export const DOCK_DEFAULT = 400;
const WIDTH_KEY = 'sajni-dock-width';

export const clampDock = (w: number) => Math.round(Math.max(DOCK_MIN, Math.min(DOCK_MAX, w)));

export function readDockWidth(): number {
  try { return clampDock(Number(localStorage.getItem(WIDTH_KEY)) || DOCK_DEFAULT); } catch { return DOCK_DEFAULT; }
}

export function saveDockWidth(w: number) {
  try { localStorage.setItem(WIDTH_KEY, String(w)); } catch { /* private mode */ }
}

/** `push` from 1100px (the page narrows), `overlay` from 768px (over the
 *  page's right edge), `sheet` below that (phones: full screen, as before). */
export type DockMode = 'push' | 'overlay' | 'sheet';

const PUSH = '(min-width: 1100px)';
const OVERLAY = '(min-width: 768px)';

function currentMode(): DockMode {
  if (typeof window === 'undefined') return 'sheet';
  if (window.matchMedia(PUSH).matches) return 'push';
  return window.matchMedia(OVERLAY).matches ? 'overlay' : 'sheet';
}

export function useDockMode(): DockMode {
  const [mode, setMode] = useState(currentMode);
  useEffect(() => {
    const queries = [window.matchMedia(PUSH), window.matchMedia(OVERLAY)];
    const on = () => setMode(currentMode());
    queries.forEach((q) => q.addEventListener('change', on));
    return () => queries.forEach((q) => q.removeEventListener('change', on));
  }, []);
  return mode;
}
