// ThemeProvider — the single owner of <html data-theme>. It carries both
// theme sources behind one context:
//
//   · presets  — built-in seed palettes, applied via the data-theme CSS
//                cascade, persisted as `sajni:theme` = preset id
//   · custom   — server-side (AI-generated) themes, applied as an injected
//                stylesheet with both mode blocks (applyM3), persisted as
//                `sajni:theme` = 'custom' plus a compiled-CSS cache that
//                index.html re-injects pre-paint
//
// Nothing else may write data-theme. Mode (light/dark) is separate and owned
// by useThemePrefs/useMode via <html data-mode>; both preset and custom
// stylesheets carry light+dark blocks, so the mode toggle flips either kind
// with no re-apply — this provider only mirrors the attribute for consumers
// that need the effective mode (e.g. Settings swatch previews).

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { themes as themesApi, type UserTheme } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { applyM3, resetM3 } from './applyM3';
import { normalizePreset, presetStylesheet, type PresetId } from './presets';

// 'sajni:theme' = active preset id, or 'custom' when a server theme is live.
const THEME_KEY = 'sajni:theme';
// Keys from retired theme systems — clear them so nobody trips on them again.
const STALE_KEYS = ['sajni:theme-mode'];

interface Ctx {
  /** Active server (AI/custom) theme; null = a preset is showing. */
  active: UserTheme | null;
  /** Selected preset — what shows whenever no server theme is active. */
  preset: PresetId;
  /** Pick a preset: applies it and deactivates any server theme. */
  setPreset: (id: PresetId) => Promise<void>;
  /** Effective mode, mirrored live from <html data-mode>. */
  mode: 'light' | 'dark';
  refresh: () => Promise<void>;
  apply: (t: UserTheme | null) => void;
}

const ThemeCtx = createContext<Ctx>({
  active: null,
  preset: 'marine',
  setPreset: async () => {},
  mode: 'light',
  refresh: async () => {},
  apply: () => {},
});

function readStoredPreset(): PresetId {
  try { return normalizePreset(localStorage.getItem(THEME_KEY)); } catch { return 'marine'; }
}

function readDomMode(): 'light' | 'dark' {
  return document.documentElement.dataset.mode === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [active, setActive] = useState<UserTheme | null>(null);
  const [preset, setPresetState] = useState<PresetId>(() => readStoredPreset());
  const [mode, setMode] = useState<'light' | 'dark'>(() => readDomMode());

  // Mirror <html data-mode> (stamped by index.html early script + useMode)
  // so swatch previews re-render when the Appearance toggle flips.
  useEffect(() => {
    const root = document.documentElement;
    const mo = new MutationObserver(() => setMode(readDomMode()));
    mo.observe(root, { attributes: true, attributeFilter: ['data-mode'] });
    return () => mo.disconnect();
  }, []);

  const showPreset = useCallback((id: PresetId) => {
    resetM3();
    document.documentElement.setAttribute('data-theme', id);
    try { localStorage.setItem(THEME_KEY, id); } catch {}
    setPresetState(id);
    setActive(null);
  }, []);

  const apply = useCallback((t: UserTheme | null) => {
    if (!t) {
      // No server theme — fall back to the selected preset. A stored
      // 'custom' marker normalizes to the default preset here.
      showPreset(readStoredPreset());
      return;
    }
    applyM3(t.seeds, t.mode_pref); // also caches CSS for pre-paint
    try { localStorage.setItem(THEME_KEY, 'custom'); } catch {}
    setActive(t);
  }, [showPreset]);

  // Pick a preset from Settings: local swap first (instant), then release
  // the server-side active theme so the next boot agrees.
  const setPreset = useCallback(async (id: PresetId) => {
    const hadServerTheme = active !== null;
    showPreset(id);
    if (hadServerTheme) {
      await themesApi.deactivate().catch(console.error);
    }
  }, [active, showPreset]);

  const refresh = useCallback(async () => {
    try {
      const t = await themesApi.active();
      apply(t);
    } catch {
      apply(null);
    }
  }, [apply]);

  // Inject the preset stylesheets + drop retired localStorage keys, once.
  useEffect(() => {
    for (const k of STALE_KEYS) {
      try { localStorage.removeItem(k); } catch {}
    }
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
    <ThemeCtx.Provider value={{ active, preset, setPreset, mode, refresh, apply }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeCtx);
}
