// ThemeProvider — fetches the user's active M3 theme on boot, applies
// it via applyM3, listens for AI tool events (theme_created /
// theme_activated) and re-applies without a full reload.
//
// Mode (light/dark) is owned by useThemePrefs/useMode, which stamps
// <html data-mode>. Custom themes are injected as a stylesheet with both
// mode blocks (applyM3), so they follow that attribute exactly like the
// presets do — this provider only mirrors the attribute for consumers
// that need the effective mode (e.g. Settings swatch previews).

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { themes as themesApi, type UserTheme } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { applyM3, resetM3 } from './applyM3';
import { getPreset, presetStylesheet } from './presets';

const PRESET_KEY = 'sajni:theme';

interface Ctx {
  active: UserTheme | null;
  /** Effective mode, mirrored live from <html data-mode>. */
  mode: 'light' | 'dark';
  refresh: () => Promise<void>;
  apply: (t: UserTheme | null) => void;
}

const ThemeCtx = createContext<Ctx>({
  active: null,
  mode: 'light',
  refresh: async () => {},
  apply: () => {},
});

function readDomMode(): 'light' | 'dark' {
  return document.documentElement.dataset.mode === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [active, setActive] = useState<UserTheme | null>(null);
  const [mode, setMode] = useState<'light' | 'dark'>(() => readDomMode());

  // Mirror <html data-mode> (stamped by index.html early script + useMode)
  // so swatch previews re-render when the Appearance toggle flips. The
  // applied theme itself needs no re-apply — its stylesheet carries both
  // mode blocks.
  useEffect(() => {
    const root = document.documentElement;
    const mo = new MutationObserver(() => setMode(readDomMode()));
    mo.observe(root, { attributes: true, attributeFilter: ['data-mode'] });
    return () => mo.disconnect();
  }, []);

  const apply = useCallback((t: UserTheme | null) => {
    if (!t) {
      // No server theme: drop the custom stylesheet and fall back to the
      // user's selected CSS preset (data-theme), so the page keeps its
      // colors instead of snapping back to the bare :root default.
      resetM3();
      let presetId = 'marine';
      try { presetId = getPreset(localStorage.getItem(PRESET_KEY)).id; } catch {}
      document.documentElement.setAttribute('data-theme', presetId);
      setActive(null);
      return;
    }
    applyM3(t.seeds, t.mode_pref);
    setActive(t);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const t = await themesApi.active();
      apply(t);
    } catch {
      apply(null);
    }
  }, [apply]);

  // Inject the preset stylesheets once. Presets ride the data-theme +
  // data-mode CSS cascade (so the light/dark toggle keeps flipping them),
  // but their tokens are generated from seeds — single source of truth.
  useEffect(() => {
    const ID = 'sajni-theme-presets';
    if (document.getElementById(ID)) return;
    const el = document.createElement('style');
    el.id = ID;
    el.textContent = presetStylesheet();
    document.head.appendChild(el);
  }, []);

  // Initial load. Theme endpoints are protected, so wait for auth boot.
  // Keyed on user.id (not the user object) so a profile edit — e.g.
  // changing the display name — does NOT re-run this and reset the theme.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      apply(null);
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.id]);

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

  return (
    <ThemeCtx.Provider value={{ active, mode, refresh, apply }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeCtx);
}
