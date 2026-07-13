import { useCallback, useEffect, useState } from 'react';

// Mode (light/dark/system) and density preferences. These own the
// <html data-mode> / <html data-density> attributes (index.html stamps
// them pre-paint from the same localStorage keys).
//
// The color THEME (preset picks + AI themes) is owned entirely by
// theme/ThemeProvider — do not stamp data-theme from here.

export type ModePref = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact' | 'cozy';

const LS_MODE    = 'sajni:mode';
const LS_DENSITY = 'sajni:density';

function read<T extends string>(key: string, fallback: T): T {
  try { return (localStorage.getItem(key) as T) || fallback; } catch { return fallback; }
}

function applyMode(modePref: ModePref) {
  const effective: 'light' | 'dark' =
    modePref === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : modePref;
  document.documentElement.dataset.mode = effective;
}

export function useMode() {
  const [mode, setMode] = useState<ModePref>(() => read<ModePref>(LS_MODE, 'system'));

  useEffect(() => {
    applyMode(mode);
    if (mode !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyMode('system');
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [mode]);

  const update = useCallback((next: ModePref) => {
    setMode(next);
    try { localStorage.setItem(LS_MODE, next); } catch {}
  }, []);

  return { mode, setMode: update };
}

export function useDensity() {
  const [density, setDensity] = useState<Density>(() => read<Density>(LS_DENSITY, 'comfortable'));

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  const update = useCallback((next: Density) => {
    setDensity(next);
    try { localStorage.setItem(LS_DENSITY, next); } catch {}
    document.documentElement.dataset.density = next;
  }, []);

  return { density, setDensity: update };
}
