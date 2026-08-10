// ThemeProvider — the single owner of <html data-theme>. It carries both
// theme sources behind one context:
//
//   · presets  — built-in seed palettes, applied via the data-theme CSS
//                cascade, persisted as `sajni:theme` = preset id plus a
//                separate last-preset key
//   · custom   — server-side (AI-generated) themes, applied as an injected
//                stylesheet with both mode blocks (applyM3), persisted as
//                `sajni:theme` = 'custom' plus a compiled-CSS cache that
//                index.html re-injects pre-paint
//
// This provider also owns data-mode and data-density after index.html stamps
// them pre-paint. Preset and custom stylesheets both carry light+dark blocks,
// so changing mode flips either kind without rebuilding its palette.

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { themes as themesApi, type UserTheme } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { applyM3, resetM3 } from './applyM3';
import { normalizePreset, presetStylesheet, type PresetId } from './presets';

// 'sajni:theme' = active preset id, or 'custom' when a server theme is live.
const THEME_KEY = 'sajni:theme';
// Keep the last preset separately so leaving a custom theme restores the
// user's actual choice instead of always snapping to Marine.
const PRESET_KEY = 'sajni:preset';
const PRESET_CSS_KEY = 'sajni:preset-theme-css';
const MODE_KEY = 'sajni:mode';
const DENSITY_KEY = 'sajni:density';

export type ModePref = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact' | 'cozy';

interface Ctx {
  /** Active server (AI/custom) theme; null = a preset is showing. */
  active: UserTheme | null;
  /** Selected preset — what shows whenever no server theme is active. */
  preset: PresetId;
  /** Pick a preset: applies it and deactivates any server theme. */
  setPreset: (id: PresetId) => Promise<void>;
  /** Effective mode, mirrored live from <html data-mode>. */
  mode: 'light' | 'dark';
  modePref: ModePref;
  setMode: (mode: ModePref) => void;
  density: Density;
  setDensity: (density: Density) => void;
  refresh: () => Promise<void>;
  apply: (t: UserTheme | null) => void;
}

const ThemeCtx = createContext<Ctx>({
  active: null,
  preset: 'marine',
  setPreset: async () => {},
  mode: 'light',
  modePref: 'system',
  setMode: () => {},
  density: 'comfortable',
  setDensity: () => {},
  refresh: async () => {},
  apply: () => {},
});

function readStoredPreset(): PresetId {
  try {
    return normalizePreset(localStorage.getItem(PRESET_KEY) ?? localStorage.getItem(THEME_KEY));
  } catch {
    return 'marine';
  }
}

function readDomMode(): 'light' | 'dark' {
  return document.documentElement.dataset.mode === 'dark' ? 'dark' : 'light';
}

function readModePref(): ModePref {
  try {
    const value = localStorage.getItem(MODE_KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
  } catch {
    return 'system';
  }
}

function readDensity(): Density {
  try {
    const value = localStorage.getItem(DENSITY_KEY);
    return value === 'compact' || value === 'cozy' || value === 'comfortable'
      ? value
      : 'comfortable';
  } catch {
    return 'comfortable';
  }
}

function resolveMode(pref: ModePref): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [active, setActive] = useState<UserTheme | null>(null);
  const [preset, setPresetState] = useState<PresetId>(() => readStoredPreset());
  const [mode, setResolvedMode] = useState<'light' | 'dark'>(() => readDomMode());
  const [modePref, setModePref] = useState<ModePref>(() => readModePref());
  const [density, setDensityState] = useState<Density>(() => readDensity());

  // index.html stamps these attributes before React. From this point onward,
  // this provider is their single owner, including the OS-mode listener.
  useEffect(() => {
    const applyMode = () => {
      const resolved = resolveMode(modePref);
      document.documentElement.dataset.mode = resolved;
      setResolvedMode(resolved);
    };
    applyMode();
    if (modePref !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', applyMode);
    return () => media.removeEventListener('change', applyMode);
  }, [modePref]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  const setMode = useCallback((next: ModePref) => {
    setModePref(next);
    const resolved = resolveMode(next);
    document.documentElement.dataset.mode = resolved;
    setResolvedMode(resolved);
    try { localStorage.setItem(MODE_KEY, next); } catch {}
  }, []);

  const setDensity = useCallback((next: Density) => {
    setDensityState(next);
    document.documentElement.dataset.density = next;
    try { localStorage.setItem(DENSITY_KEY, next); } catch {}
  }, []);

  const showPreset = useCallback((id: PresetId) => {
    resetM3();
    document.documentElement.setAttribute('data-theme', id);
    try { localStorage.setItem(THEME_KEY, id); } catch {}
    try { localStorage.setItem(PRESET_KEY, id); } catch {}
    setPresetState(id);
    setActive(null);
  }, []);

  const apply = useCallback((t: UserTheme | null) => {
    if (!t) {
      // No server theme — restore the last selected preset.
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
    showPreset(id);
    if (user) {
      await themesApi.deactivate().catch(console.error);
    }
  }, [showPreset, user]);

  const refresh = useCallback(async () => {
    const t = await themesApi.active();
    apply(t);
  }, [apply]);

  // Inject the generated preset stylesheets once.
  useEffect(() => {
    const ID = 'sajni-theme-presets';
    const css = presetStylesheet();
    let el = document.getElementById(ID) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = ID;
      document.head.appendChild(el);
    }
    el.textContent = css;
    try { localStorage.setItem(PRESET_CSS_KEY, css); } catch {}
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
    void refresh().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.id]);

  // AI tool events from AIChat. Both `theme_created` (with activate:true)
  // and `theme_activated` should re-fetch the active theme.
  useEffect(() => {
    const onInvalidate = (e: Event) => {
      const detail = (e as CustomEvent).detail as { kind?: string; activated?: boolean } | undefined;
      const k = detail?.kind;
      if (k === 'theme_activated' || (k === 'theme_created' && detail?.activated)) {
        void refresh().catch(console.error);
      }
    };
    window.addEventListener('data:invalidate', onInvalidate);
    return () => window.removeEventListener('data:invalidate', onInvalidate);
  }, [refresh]);

  return (
    <ThemeCtx.Provider value={{
      active,
      preset,
      setPreset,
      mode,
      modePref,
      setMode,
      density,
      setDensity,
      refresh,
      apply,
    }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeCtx);
}
