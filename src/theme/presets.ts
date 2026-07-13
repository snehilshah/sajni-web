// Built-in theme presets. Each is just a set of M3 seeds; the full token
// set (light + dark) is derived from them via buildPalette — the same
// engine the AI-generated themes use. Single source of truth: change a
// seed here and both the swatch preview and the applied colors update.
//
// Presets are applied through the proven `data-theme` + `data-mode` CSS
// cascade (see presetStylesheet, injected by ThemeProvider) rather than
// inline vars, so the Settings light/dark toggle keeps flipping them.

import { buildPalette, type ThemeSeeds } from './applyM3';

export type PresetId =
  | 'marine'
  | 'powerpuff'
  | 'gruvbox'
  | 'peach'
  | 'mauve';

export interface ThemePreset {
  id: PresetId;
  label: string;
  emoji: string;
  seeds: ThemeSeeds;
  overrides?: {
    light?: Record<string, string>;
    dark?: Record<string, string>;
  };
}

export const PRESETS: ThemePreset[] = [
  {
    id: 'marine',
    label: 'Marine',
    emoji: '🌊',
    seeds: { primary: '#1F7A8C', secondary: '#3E6B99', tertiary: '#2E8B6B' },
  },
  {
    id: 'powerpuff',
    label: 'PowerPuff',
    emoji: '🎀',
    seeds: { primary: '#eb6f92', secondary: '#C693EC', tertiary: '#ebbcba' },
  },
  {
    id: 'gruvbox',
    label: 'Gruvbox',
    emoji: '🍂',
    seeds: { primary: '#458588', secondary: '#D8A657', tertiary: '#D3869B', neutral: '#FBF1C7' },
    overrides: {
      light: {
        surface: '48 84% 88%',
        'on-surface': '20 5% 22%',
        'surface-dim': '43 56% 81%',
        'surface-bright': '48 100% 95%',
        'surface-container-lowest': '0 0% 100%',
        'surface-container-low': '48 84% 92%',
        'surface-container': '48 79% 87%',
        'surface-container-high': '48 60% 84%',
        'surface-container-highest': '48 50% 80%',
        'on-surface-variant': '20 6% 38%',
        outline: '20 6% 52%',
        'outline-variant': '20 8% 82%',
      },
      dark: {
        surface: '0 0% 16%',
        'on-surface': '43 56% 81%',
        'surface-dim': '195 6% 12%',
        'surface-bright': '20 7% 29%',
        'surface-container-lowest': '0 0% 10%',
        'surface-container-low': '0 0% 13%',
        'surface-container': '20 5% 22%',
        'surface-container-high': '20 7% 29%',
        'surface-container-highest': '24 10% 37%',
        'on-surface-variant': '43 35% 72%',
        outline: '43 20% 50%',
        'outline-variant': '43 25% 30%',
      },
    },
  },
  {
    id: 'peach',
    label: 'Peach',
    emoji: '🍑',
    seeds: { primary: '#D7897F', secondary: '#F9B95C', tertiary: '#96C7B3' },
  },
  {
    id: 'mauve',
    label: 'Mauve',
    emoji: '🔮',
    seeds: { primary: '#191724', secondary: '#e0def4', tertiary: '#eb6f92' },
  },
];

// Picker metadata for the Settings theme row.
export const THEMES: { id: PresetId; label: string; emoji: string }[] =
  PRESETS.map((p) => ({ id: p.id, label: p.label, emoji: p.emoji }));

const VALID = new Set<string>(PRESETS.map((p) => p.id));

// Use a stored theme id only if it's a current preset; anything else — a
// removed theme, a legacy id, or junk — falls back to marine. Themes are
// final, so there's no alias migration: valid choices are kept as-is,
// unknown ones snap to marine.
export function normalizePreset(id: string | null | undefined): PresetId {
  if (id && VALID.has(id)) return id as PresetId;
  return 'marine';
}

export function getPreset(id: string | null | undefined): ThemePreset {
  const norm = normalizePreset(id);
  return PRESETS.find((p) => p.id === norm) ?? PRESETS[0];
}

// presetStylesheet emits one CSS block per preset for light + dark. Only the
// M3 base tokens are written; the shadcn aliases (--background, --card, …)
// live in index.css as var() references and re-resolve automatically once
// the base tokens are overridden.
export function presetStylesheet(): string {
  return PRESETS.map((p) => {
    const pal = buildPalette(p.seeds);
    if (p.overrides?.light) {
      pal.light = { ...pal.light, ...p.overrides.light };
    }
    if (p.overrides?.dark) {
      pal.dark = { ...pal.dark, ...p.overrides.dark };
    }
    const block = (m: Record<string, string>) =>
      Object.entries(m)
        .map(([k, v]) => `--${k}:${v}`)
        .join(';');
    return (
      `[data-theme="${p.id}"]{${block(pal.light)}}` +
      `[data-theme="${p.id}"][data-mode="dark"]{${block(pal.dark)}}`
    );
  }).join('\n');
}
