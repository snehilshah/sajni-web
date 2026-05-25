// ThemeProvider — fetches the user's active M3 theme on boot, applies
// it via applyM3, listens for AI tool events (theme_created /
// theme_activated) and re-applies without a full reload.

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { themes as themesApi, type UserTheme } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { applyM3, resetM3 } from './applyM3';

interface Ctx {
  active: UserTheme | null;
  mode: 'light' | 'dark';
  setMode: (m: 'light' | 'dark') => void;
  refresh: () => Promise<void>;
  apply: (t: UserTheme | null, mode?: 'light' | 'dark') => void;
}

const ThemeCtx = createContext<Ctx>({
  active: null,
  mode: 'light',
  setMode: () => {},
  refresh: async () => {},
  apply: () => {},
});

const MODE_KEY = 'sajni:theme-mode';

function detectInitialMode(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {}
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [active, setActive] = useState<UserTheme | null>(null);
  const [mode, setModeState] = useState<'light' | 'dark'>(() => detectInitialMode());

  // Push the mode flag onto <html data-mode="..."> before paint so the
  // index.css fallback rules pick the right column even when no custom
  // theme is loaded.
  useEffect(() => {
    document.documentElement.setAttribute('data-mode', mode);
    try { localStorage.setItem(MODE_KEY, mode); } catch {}
  }, [mode]);

  const apply = useCallback((t: UserTheme | null, m?: 'light' | 'dark') => {
    const targetMode = m ?? mode;
    if (!t) {
      resetM3();
      setActive(null);
      return;
    }
    const resolvedMode = t.mode_pref === 'auto' ? targetMode : t.mode_pref;
    applyM3(t.seeds, resolvedMode);
    setActive(t);
  }, [mode]);

  const refresh = useCallback(async () => {
    try {
      const t = await themesApi.active();
      apply(t);
    } catch {
      apply(null);
    }
  }, [apply]);

  // Initial load. Theme endpoints are protected, so wait for auth boot.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      apply(null);
      return;
    }
    refresh();
  }, [apply, loading, refresh, user]);

  // When the mode toggle changes (light/dark), re-apply the current
  // theme so the new tones land. Custom themes with `mode_pref` set to
  // a specific mode ignore the toggle.
  useEffect(() => {
    if (active) apply(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // AI tool events from AIChat. Both `theme_created` (with activate:true)
  // and `theme_activated` should re-fetch the active theme.
  useEffect(() => {
    const onInvalidate = (e: Event) => {
      const detail = (e as CustomEvent).detail as { kind?: string; activated?: boolean } | undefined;
      const k = detail?.kind;
      if (k === 'theme_activated' || (k === 'theme_created' && detail?.activated)) {
        refresh();
      }
    };
    window.addEventListener('data:invalidate', onInvalidate);
    return () => window.removeEventListener('data:invalidate', onInvalidate);
  }, [refresh]);

  const setMode = (m: 'light' | 'dark') => setModeState(m);

  return (
    <ThemeCtx.Provider value={{ active, mode, setMode, refresh, apply }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeCtx);
}
