import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { themes as themesApi, type UserTheme } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { customThemeStylesheet } from './applyM3';
import { normalizePreset, presetStylesheet, type PresetId } from './presets';

const THEME_KEY = 'sajni:theme';
const MODE_KEY = 'sajni:mode';
const DENSITY_KEY = 'sajni:density';
const PRESET_STYLE_ID = 'sajni-theme-presets';
const CUSTOM_STYLE_ID = 'sajni-custom-theme';

export type ModePref = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact' | 'cozy';
export type ThemeAction =
  | { kind: 'preset'; preset: PresetId }
  | { kind: 'activate'; id: number }
  | { kind: 'delete'; id: number }
  | { kind: 'generate' };

interface Ctx {
  active: UserTheme | null;
  preset: PresetId;
  action: ThemeAction | null;
  setPreset: (id: PresetId) => Promise<void>;
  activateTheme: (theme: UserTheme) => Promise<UserTheme>;
  generateTheme: (prompt: string) => Promise<UserTheme>;
  deleteTheme: (theme: UserTheme) => Promise<void>;
  mode: 'light' | 'dark';
  modePref: ModePref;
  setMode: (mode: ModePref) => void;
  density: Density;
  setDensity: (density: Density) => void;
  refresh: () => Promise<void>;
}

const ThemeCtx = createContext<Ctx>({
  active: null,
  preset: 'marine',
  action: null,
  setPreset: async () => {},
  activateTheme: async (theme) => theme,
  generateTheme: async () => { throw new Error('ThemeProvider is unavailable'); },
  deleteTheme: async () => {},
  mode: 'light',
  modePref: 'system',
  setMode: () => {},
  density: 'comfortable',
  setDensity: () => {},
  refresh: async () => {},
});

function readStoredPreset(): PresetId {
  try {
    return normalizePreset(localStorage.getItem(THEME_KEY));
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
  const userID = user?.id;
  const [active, setActive] = useState<UserTheme | null>(null);
  const [preset, setPresetState] = useState<PresetId>(() => readStoredPreset());
  const [action, setAction] = useState<ThemeAction | null>(null);
  const [mode, setResolvedMode] = useState<'light' | 'dark'>(() => readDomMode());
  const [modePref, setModePref] = useState<ModePref>(() => readModePref());
  const [density, setDensityState] = useState<Density>(() => readDensity());
  const actionLock = useRef(false);
  const selectionVersion = useRef(0);

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

  // Built-in palettes are deterministic and generated from presets.ts once.
  useEffect(() => {
    let style = document.getElementById(PRESET_STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = PRESET_STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = presetStylesheet();
  }, []);

  // This is the only effect that paints a theme. The selected React state is
  // therefore always the same state represented by <html data-theme>.
  useEffect(() => {
    if (active) {
      let style = document.getElementById(CUSTOM_STYLE_ID) as HTMLStyleElement | null;
      if (!style) {
        style = document.createElement('style');
        style.id = CUSTOM_STYLE_ID;
        document.head.appendChild(style);
      }
      style.textContent = customThemeStylesheet(active.seeds);
      document.documentElement.dataset.theme = 'custom';
      return;
    }

    document.getElementById(CUSTOM_STYLE_ID)?.remove();
    document.documentElement.dataset.theme = preset;
    try { localStorage.setItem(THEME_KEY, preset); } catch {}
  }, [active, preset]);

  const beginAction = useCallback((next: ThemeAction): number => {
    if (actionLock.current) throw new Error('Another theme change is still in progress');
    actionLock.current = true;
    const version = ++selectionVersion.current;
    setAction(next);
    return version;
  }, []);

  const finishAction = useCallback((version: number) => {
    if (selectionVersion.current !== version) return;
    actionLock.current = false;
    setAction(null);
  }, []);

  const setPreset = useCallback(async (id: PresetId) => {
    const version = beginAction({ kind: 'preset', preset: id });
    const previousPreset = preset;
    const previousActive = active;
    setPresetState(id);
    setActive(null);
    try {
      if (userID) await themesApi.deactivate();
    } catch (error) {
      if (selectionVersion.current === version) {
        setPresetState(previousPreset);
        setActive(previousActive);
      }
      throw error;
    } finally {
      finishAction(version);
    }
  }, [active, beginAction, finishAction, preset, userID]);

  const activateTheme = useCallback(async (theme: UserTheme) => {
    const version = beginAction({ kind: 'activate', id: theme.id });
    const previous = active;
    setActive(theme);
    try {
      const confirmed = await themesApi.activate(theme.id);
      if (selectionVersion.current === version) setActive(confirmed);
      return confirmed;
    } catch (error) {
      if (selectionVersion.current === version) setActive(previous);
      throw error;
    } finally {
      finishAction(version);
    }
  }, [active, beginAction, finishAction]);

  const generateTheme = useCallback(async (prompt: string) => {
    const version = beginAction({ kind: 'generate' });
    try {
      const generated = await themesApi.generate(prompt);
      if (selectionVersion.current === version) setActive(generated);
      return generated;
    } finally {
      finishAction(version);
    }
  }, [beginAction, finishAction]);

  const deleteTheme = useCallback(async (theme: UserTheme) => {
    const version = beginAction({ kind: 'delete', id: theme.id });
    try {
      await themesApi.delete(theme.id);
      if (selectionVersion.current === version && active?.id === theme.id) {
        setActive(null);
      }
    } finally {
      finishAction(version);
    }
  }, [active?.id, beginAction, finishAction]);

  const refresh = useCallback(async () => {
    if (actionLock.current) return;
    const version = selectionVersion.current;
    const serverTheme = await themesApi.active();
    if (!actionLock.current && selectionVersion.current === version) {
      setActive(serverTheme);
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!userID) {
      ++selectionVersion.current;
      actionLock.current = false;
      setAction(null);
      setActive(null);
      return;
    }
    void refresh().catch(console.error);
  }, [loading, refresh, userID]);

  useEffect(() => {
    const onInvalidate = (event: Event) => {
      const kind = (event as CustomEvent<{ kind?: string }>).detail?.kind;
      if (kind === 'theme_activated' || kind === 'theme_created') {
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
      action,
      setPreset,
      activateTheme,
      generateTheme,
      deleteTheme,
      mode,
      modePref,
      setMode,
      density,
      setDensity,
      refresh,
    }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeCtx);
}
